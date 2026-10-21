// Shared karansea CTC inference core (JS port of the numpy bits).
const ort = require('onnxruntime-node');
const VOCAB = require('./assets/vocab'); // id -> piece
const pace = require('./pace');

const SR = 16000;
const BLANK = 256;

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

  static async create(modelPath, vocab = VOCAB) {
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
    const sess = await ort.InferenceSession.create(modelPath, {
      intraOpNumThreads: threads,
      interOpNumThreads: 1,
      extra: { session: { 'session.intra_op.allow_spinning': '0' } },
    });
    return new Infer(sess, vocab);
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
    const out = await this.run(buf);
    const ms = Date.now() - t0;
    if (this.perf.ms.length < 100000) this.perf.ms.push(ms);
    pace.notePass(ms, buf.length);
    if (this.memo) this.memo = { buf: buf.slice(0), out };
    return out;
  }

  // One model pass, untimed (emissions() times it: a benchmark that slows the model wraps run).
  async run(buf) {
    const feeds = {
      audio: new ort.Tensor('float32', buf, [1, buf.length]),
      audio_len: new ort.Tensor('int64', BigInt64Array.from([BigInt(buf.length)]), [1]),
    };
    const out = await this.sess.run(feeds);
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

module.exports = { Infer, resampleTo16k, norm, SR, BLANK };
