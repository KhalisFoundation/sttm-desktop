// Shared karansea CTC inference core (JS port of the numpy bits).
const ort = require('onnxruntime-node');
const VOCAB = require('./assets/vocab'); // id -> piece
const pace = require('./pace');
const { hasNaN } = require('./gpu-mode');

const TEST_PASS_MS = process.env.VF_TEST_WAV ? Number(process.env.VF_TEST_PASS_MS || 0) : 0;
const SR = 16000;
const BLANK = 256;
const GPU_BUSY = new WeakMap(); // GPU session -> passes running on it (GPU mode only)

// strip whitespace, dandas, Gurmukhi/ASCII digits, punctuation (matches _STRIP)
const STRIP = /[\s।॥|0-9੦-੯.,;:!?\-]+/g;
const norm = (s) => (s || '').replace(STRIP, '');

function resampleTo16k(pcm, inSr) {
  if (inSr === SR) return pcm;
  const n = Math.round((pcm.length * SR) / inSr);
  if (n <= 0) return new Float32Array(0);
  const out = new Float32Array(n);
  const last = pcm.length - 1;
  for (let k = 0; k < n; k++) {
    const x = (k * pcm.length) / n; // linspace(0,len,n,endpoint=False)
    if (x <= 0) {
      out[k] = pcm[0];
      continue;
    }
    if (x >= last) {
      out[k] = pcm[last];
      continue;
    }
    const i0 = Math.floor(x);
    const frac = x - i0;
    out[k] = pcm[i0] * (1 - frac) + pcm[i0 + 1] * frac;
  }
  return out;
}

class Infer {
  constructor(sess, vocab) {
    this.sess = sess;
    this.vocab = vocab;
    // Wall ms of each model pass since perfStats() last read them (session health).
    this.perf = { ms: [], since: Date.now(), repeats: 0 };
    // The last window and its output. The recognizer and the follower each keep their own
    // copy of the same audio, so while a Bani or Shabad is followed every other follower
    // window is byte-identical to the recognizer's: the model is run once per distinct
    // window (a third of the passes while following) — in the aligned tiers only, see
    // emissions(). VF_NO_MEMO=1 turns it off (A/B).
    this.memo = process.env.VF_NO_MEMO ? null : { buf: null, out: null };
  }

  static sameWindow(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
    return true;
  }

  // Inference timing since the last call: windows decoded, median/max ms per window,
  // windows per second of wall time. Resets the record.
  perfStats() {
    const { ms, since, repeats } = this.perf;
    const now = Date.now();
    this.perf = { ms: [], since: now, repeats: 0 };
    const sorted = [...ms].sort((a, b) => a - b);
    const span = Math.max(0.001, (now - since) / 1000);
    return {
      windows: ms.length,
      repeats, // windows answered from the memo (no model pass)
      medianMs: sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)]) : null,
      maxMs: sorted.length ? Math.round(sorted[sorted.length - 1]) : null,
      windowsPerSec: Math.round((ms.length / span) * 100) / 100,
    };
  }

  // Session options: the thread rule below, plus executionProviders for GPU mode only (the default
  // CPU session is created with exactly the options it always had).
  static sessionOptions(executionProviders) {
    // ONNX Runtime defaults to one spinning thread per core (9.9 cores busy on a 20-core PC
    // for work 4 threads finish in 239 ms of the 500 ms hop). 4 threads give bit-identical
    // output to the default (58/58 kirtan windows, zero confidence difference) and use 2.3
    // of 8 cores. Machines with fewer than 8 logical cores get 2 threads: 4 would still take
    // 3.1 of 4 cores; 2 keep up (325 ms) at ~1 core with near-identical text (49/58 windows).
    // eslint-disable-next-line global-require
    const cores = require('os').cpus().length;
    // VF_ORT_THREADS (benchmarks, A/B of thread counts) overrides the rule.
    const env = parseInt(process.env.VF_ORT_THREADS || '', 10);
    let threads = cores >= 8 ? 4 : Math.max(1, Math.min(2, cores));
    if (env > 0) threads = env;
    const opts = {
      intraOpNumThreads: threads,
      interOpNumThreads: 1,
      extra: { session: { 'session.intra_op.allow_spinning': '0' } },
    };
    if (executionProviders) {
      opts.executionProviders = executionProviders;
      opts.logSeverityLevel = 3; // the expected "some nodes stay on the CPU" warning is not news
    }
    return opts;
  }

  // GPU mode (gpu-mode.js): a session on the graphics chip through WebGPU, never CoreML.
  static createGpuSession(modelPath) {
    return ort.InferenceSession.create(modelPath, Infer.sessionOptions(['webgpu']));
  }

  static createCpuSession(modelPath) {
    return ort.InferenceSession.create(modelPath, Infer.sessionOptions());
  }

  static async create(modelPath, vocab = VOCAB) {
    const sess = await Infer.createCpuSession(modelPath);
    return new Infer(sess, vocab);
  }

  // GPU mode on: model passes go to gpuSess; the CPU (int8) session stays loaded as the fallback.
  // onFallback(error) is told once if the graphics chip fails.
  useGpu(gpuSess, onFallback) {
    if (!this.cpuSess) this.cpuSess = this.sess;
    this.gpuSess = gpuSess;
    this.onFallback = onFallback || null;
    this.sess = gpuSess;
    this.gpu = true;
    this.memo = this.memo && { buf: null, out: null };
  }

  // Back to the CPU (int8) session; error = the GPU failure that caused it (reported once).
  useCpu(error) {
    if (!this.gpu) return;
    this.gpu = false;
    this.sess = this.cpuSess;
    this.memo = this.memo && { buf: null, out: null };
    const g = this.gpuSess;
    this.gpuSess = null;
    if (error) {
      this.gpuError = String((error && error.message) || error);
      const cb = this.onFallback;
      this.onFallback = null;
      if (cb) {
        try {
          cb(error);
        } catch (_) {
          /* logging never breaks a pass */
        }
      }
    }
    Infer.releaseWhenIdle(g, error ? Infer.RELEASE_MS.failed : 0);
  }

  // Free a GPU session once no pass is using it (a failed one after a pause; errors ignored).
  static releaseWhenIdle(sess, delayMs = 0) {
    if (!sess) return;
    const release = () => {
      if ((GPU_BUSY.get(sess) || 0) > 0) {
        setTimeout(release, Infer.RELEASE_MS.poll);
        return;
      }
      try {
        Promise.resolve(sess.release && sess.release()).catch(() => {});
      } catch (_) {
        /* already unusable */
      }
    };
    setTimeout(release, delayMs);
  }

  // The CPU session (the int8 model): the GPU self-check times it.
  cpuSession() {
    return this.gpu ? this.cpuSess : this.sess;
  }

  // buf: Float32Array @16k -> {data:Float32Array flat, frames, C}
  async emissions(buf) {
    // The memo serves the aligned tiers only: in the fast tier (a computer that keeps up)
    // every window is a model pass, exactly as before the tiers existed.
    const memo = this.memo && pace.current().aligned ? this.memo : null;
    if (memo && Infer.sameWindow(memo.buf, buf)) {
      this.perf.repeats += 1;
      return memo.out;
    }
    const t0 = Date.now();
    this.lastPassAt = t0; // GPU mode's self-check waits while live passes run
    const out = await this.run(buf);
    // Scripted end-to-end tests only (VF_TEST_WAV is the microphone): VF_TEST_PASS_MS adds this
    // much time per 4 s window, to run a fast computer at a slower one's measured speed.
    if (TEST_PASS_MS > 0) {
      await new Promise((r) => {
        setTimeout(r, (TEST_PASS_MS * buf.length) / (4 * 16000));
      });
    }
    const ms = Date.now() - t0;
    if (this.perf.ms.length < 100000) this.perf.ms.push(ms);
    pace.notePass(ms, buf.length);
    if (this.memo) this.memo = { buf: buf.slice(0), out };
    return out;
  }

  // One model pass, untimed (emissions() times it: a benchmark that slows the model wraps run).
  // In GPU mode, any error or NaN from the graphics chip moves this app run to the CPU and the
  // same window is decoded there.
  async run(buf) {
    if (this.gpu) {
      const g = this.gpuSess;
      GPU_BUSY.set(g, (GPU_BUSY.get(g) || 0) + 1);
      try {
        const out = await Infer.runOn(g, buf);
        if (hasNaN(out)) throw new Error('NaN in the GPU output');
        return out;
      } catch (e) {
        if (this.gpuSess === g) this.useCpu(e);
      } finally {
        GPU_BUSY.set(g, GPU_BUSY.get(g) - 1);
      }
    }
    return Infer.runOn(this.sess, buf);
  }

  static async runOn(sess, buf) {
    const feeds = {
      audio: new ort.Tensor('float32', buf, [1, buf.length]),
      audio_len: new ort.Tensor('int64', BigInt64Array.from([BigInt(buf.length)]), [1]),
    };
    const out = await sess.run(feeds);
    const lp = out.log_probs;
    const [, , C] = lp.dims;
    const frames = Number(out.out_len.data[0]);
    return { data: lp.data, frames, C };
  }

  greedy({ data, frames, C }) {
    const ids = [];
    let prev = -1;
    for (let t = 0; t < frames; t++) {
      let best = 0;
      let bestv = -Infinity;
      const off = t * C;
      for (let c = 0; c < C; c++) {
        const v = data[off + c];
        if (v > bestv) {
          bestv = v;
          best = c;
        }
      }
      if (best !== prev && best !== BLANK) ids.push(best);
      prev = best;
    }
    return ids;
  }

  decode(ids) {
    let s = '';
    for (const id of ids) s += this.vocab[id];
    return s.replace(/▁/g, ' ').trim();
  }

  // mean over used frames of exp(max_c lp[t,c])  (matches Python conf)
  confidence({ data, frames, C }) {
    let sum = 0;
    for (let t = 0; t < frames; t++) {
      let m = -Infinity;
      const off = t * C;
      for (let c = 0; c < C; c++) if (data[off + c] > m) m = data[off + c];
      sum += Math.exp(m);
    }
    return frames ? sum / frames : 0;
  }
}

// When a GPU session is freed: a failed one after a pause; a busy one re-checked every poll.
Infer.RELEASE_MS = { failed: 5000, poll: 1000 };

module.exports = { Infer, resampleTo16k, norm, SR, BLANK };
