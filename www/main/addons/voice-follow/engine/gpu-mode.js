// GPU mode (opt-in): run the speech model on the graphics chip through onnxruntime-node's WebGPU
// execution provider (Direct3D 12 on Windows, Metal on Mac), with the full-precision (fp32) model.
// On an M4 Pro this is 1.5-2.2x faster than the int8 model on the CPU, with the same output as fp32
// on the CPU. It is meant for computers the "Check this computer" test finds too slow.
//
// Off by default: a computer that never asks for it runs exactly as before (the int8 model on the
// CPU, same code path). It is wanted when the user turns it on, or when "Check this computer" grades
// the PC below the minimum. Before it is used, a self-check runs the fp32 model on the CPU and on
// the graphics chip over the same reference windows, and GPU mode is used only if:
//   - the graphics chip gives no NaN,
//   - the top token is the same on at least 99.5% of frames, and
//   - it is at least 1.3x faster than the int8 model on the CPU (what the app runs today).
// The result is remembered per computer (gpu-mode.json beside the model) and re-checked when the
// platform or the ONNX Runtime version changes. Any error from the graphics chip while listening
// falls back to the int8 model on the CPU for the rest of the app run (infer.js).
//
// CoreML is never used: its NeuralNetwork format returns NaN for this model.

const AGREE_MIN = 0.995;
const SPEEDUP_MIN = 1.3;
const SR = 16000;
// Reference windows: the app's two window sizes (4 s following, 10 s finding).
const WINDOW_S = [4, 4, 4, 4, 4, 10, 10, 10, 10, 10];

// Platforms whose onnxruntime-node build ships the WebGPU provider.
function supported(platform = process.platform, arch = process.arch) {
  return platform === 'win32' || (platform === 'darwin' && arch === 'arm64');
}

// Deterministic, voice-like test audio (no recording ships with the app): a sung tone whose pitch
// glides and wavers, rich in harmonics with a changing "vowel" every 0.2 s, under light noise.
function referenceWindow(seconds, k) {
  let seed = 7919 * (k + 1);
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648 - 0.5;
  };
  const n = Math.round(seconds * SR);
  const buf = new Float32Array(n);
  const f0Base = 110 + 25 * k;
  let phase = 0;
  let amps = [1, 0.5, 0.3, 0.2, 0.1, 0.05];
  for (let i = 0; i < n; i += 1) {
    const t = i / SR;
    if (i % (SR / 5) === 0) amps = amps.map(() => 0.1 + Math.abs(rnd()) * 1.8);
    const f0 =
      f0Base *
      (1 + 0.25 * Math.sin(2 * Math.PI * 0.3 * t)) *
      (1 + 0.02 * Math.sin(2 * Math.PI * 5.5 * t));
    phase += (2 * Math.PI * f0) / SR;
    let v = 0;
    for (let h = 0; h < amps.length; h += 1) v += amps[h] * Math.sin((h + 1) * phase);
    const syllable = 0.5 - 0.5 * Math.cos(2 * Math.PI * 2.5 * t); // ~2.5 syllables a second
    buf[i] = 0.05 * syllable * v + 0.01 * rnd();
  }
  return buf;
}

function referenceWindows() {
  return WINDOW_S.map((s, k) => referenceWindow(s, k));
}

// Top token of every frame of one model output ({ data, frames, C }).
function topTokens({ data, frames, C }) {
  const ids = new Int32Array(frames);
  for (let t = 0; t < frames; t += 1) {
    let best = 0;
    let bestv = -Infinity;
    const off = t * C;
    for (let c = 0; c < C; c += 1) {
      if (data[off + c] > bestv) {
        bestv = data[off + c];
        best = c;
      }
    }
    ids[t] = best;
  }
  return ids;
}

function hasNaN({ data, frames, C }) {
  const n = frames * C;
  for (let i = 0; i < n; i += 1) if (Number.isNaN(data[i])) return true;
  return false;
}

// Frames with the same top token, over all windows (a window whose frame count differs counts as
// all frames different).
function agreement(a, b) {
  let same = 0;
  let total = 0;
  for (let w = 0; w < a.length; w += 1) {
    const x = a[w];
    const y = b[w] || new Int32Array(0);
    total += Math.max(x.length, y.length);
    if (x.length === y.length) {
      for (let t = 0; t < x.length; t += 1) if (x[t] === y[t]) same += 1;
    }
  }
  return total ? same / total : 0;
}

// The gate: { nan, agree (0..1), speedup (int8 CPU ms / GPU ms) } -> { ok, reason }.
function verdict({ nan, agree, speedup }) {
  if (nan) return { ok: false, reason: 'nan' };
  if (!(agree >= AGREE_MIN)) return { ok: false, reason: 'mismatch' };
  if (!(speedup >= SPEEDUP_MIN)) return { ok: false, reason: 'not_faster' };
  return { ok: true, reason: 'ok' };
}

// The self-check. open(kind) gives a runner { run(buf) -> {data, frames, C}, release() } for
// kind 'cpu-fp32' | 'gpu-fp32'; int8 is the runner of the model the app already uses. Sessions are
// opened one at a time (memory on small PCs). Returns the verdict with its numbers and, when it
// passes, the open GPU runner (the caller adopts it). Never throws: an error is a failed check.
async function selfCheck({
  open,
  int8,
  windows = referenceWindows(),
  now = () => performance.now(),
}) {
  const timed = async (runner, keep) => {
    await runner.run(windows[0]); // warm-up (first pass compiles kernels / allocates)
    const outs = [];
    let ms = 0;
    for (let i = 0; i < windows.length; i += 1) {
      const t0 = now();
      // eslint-disable-next-line no-await-in-loop
      const out = await runner.run(windows[i]);
      ms += now() - t0;
      outs.push(keep(out));
    }
    return { outs, ms };
  };
  let gpu = null;
  try {
    const cpu = await open('cpu-fp32');
    let ref;
    try {
      ref = (await timed(cpu, topTokens)).outs;
    } finally {
      await cpu.release();
    }
    const base = await timed(int8, () => null);
    gpu = await open('gpu-fp32');
    const g = await timed(gpu, (o) => ({ nan: hasNaN(o), ids: topTokens(o) }));
    const nan = g.outs.some((o) => o.nan);
    const agree = nan
      ? 0
      : agreement(
          ref,
          g.outs.map((o) => o.ids),
        );
    const speedup = g.ms > 0 ? base.ms / g.ms : 0;
    const v = verdict({ nan, agree, speedup });
    const result = {
      ...v,
      agree: Number(agree.toFixed(4)),
      speedup: Number(speedup.toFixed(2)),
      int8Ms: Math.round(base.ms / windows.length),
      gpuMs: Math.round(g.ms / windows.length),
    };
    if (!v.ok) {
      await gpu.release();
      gpu = null;
    }
    return { result, gpu };
  } catch (e) {
    if (gpu) {
      try {
        await gpu.release();
      } catch (_) {
        /* the session is already unusable */
      }
    }
    return {
      result: { ok: false, reason: 'error', error: String((e && e.message) || e) },
      gpu: null,
    };
  }
}

// What the remembered check is valid for: a new ONNX Runtime or platform re-runs it.
function checkKey(ortVersion, platform = process.platform, arch = process.arch) {
  return `${platform}-${arch}-ort${ortVersion || '?'}`;
}

// Runtime fallbacks (GPU errors while listening) after which this computer stops using GPU mode.
const MAX_FALLBACKS = 2;

// Saved state -> should the engine use the graphics chip now?
function shouldUse(state, key, modelReady) {
  return !!(
    state &&
    state.wanted &&
    state.check &&
    state.check.ok &&
    state.check.key === key &&
    !state.pending &&
    (state.fallbacks || 0) < MAX_FALLBACKS &&
    modelReady
  );
}

// At launch: a GPU step that was still pending means the last app run crashed or hung on the
// graphics chip (or the driver reset). That counts as a failed check, so it never repeats.
function afterCrash(state, key, at = new Date().toISOString()) {
  if (!state || !state.pending) return null;
  const { pending, ...rest } = state;
  return { ...rest, check: { ok: false, reason: 'crashed', step: pending, key, at } };
}

// A GPU error while listening: count it (shouldUse stops after MAX_FALLBACKS).
function afterFallback(state) {
  return { ...(state || {}), fallbacks: ((state && state.fallbacks) || 0) + 1 };
}

// Should "Check this computer" start GPU mode on its own? Only for a PC below the minimum, on a
// platform with WebGPU, when the user has not turned it off and it has not been tried for this key.
function autoWanted(hwResult, state, key, isSupported = supported()) {
  if (!isSupported || !hwResult || hwResult.error || hwResult.verdict !== 'below') return false;
  if (state && state.userOff) return false;
  if (state && state.check && state.check.key === key) return false;
  if (state && state.autoTried === key) return false;
  return true;
}

module.exports = {
  AGREE_MIN,
  SPEEDUP_MIN,
  supported,
  referenceWindows,
  topTokens,
  hasNaN,
  agreement,
  verdict,
  selfCheck,
  checkKey,
  shouldUse,
  afterCrash,
  afterFallback,
  autoWanted,
  MAX_FALLBACKS,
};
