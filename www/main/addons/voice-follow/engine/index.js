// Public entry point for the in-process voice-follow engine.
//
// Everything runs natively in the Electron renderer via onnxruntime-node — no
// Python sidecar, no websocket. On first use the ~184 MB int8 CTC model is
// downloaded from Hugging Face into userData (see model-manager); the tiny
// vocab/tokenizer ship in-repo. After that it is fully offline.
//
//   const engine = require('./engine');
//   await engine.ready(onProgress);              // ensures model, warms session
//   const rec = await engine.createRecognizer(); // blind auto-detect
//   const fol = await engine.createFollower(lines, opts); // track a shabad
//   const out = await fol.push(float32PcmChunk); // per audio chunk
const { Infer, norm } = require('./infer');
const { SP } = require('./sentencepiece');
const { Recognizer } = require('./recognizer');
const { Follower } = require('./follower');
const { FollowerV2 } = require('./follower2');
const NITNEM = require('./assets/nitnem-lines');
const { partialRatio } = require('./fuzz');
const modelManager = require('./model-manager');
const pace = require('./pace');
const gpuMode = require('./gpu-mode');

let inferPromise = null; // shared session (load the model once)
let sp = null; // tokenizer is cheap + stateless, share it too
let loadedInfer = null; // the shared session once it is up (for perfStats)

// Ensure the model is present and the ONNX session is loaded. onProgress(0..1)
// is called during download only. Safe to call repeatedly — work happens once.
async function ready(onProgress) {
  if (!inferPromise) {
    inferPromise = (async () => {
      const modelPath = await modelManager.ensureModel(onProgress);
      loadedInfer = await Infer.create(modelPath);
      // GPU mode (off unless this computer asked for it and passed its self-check).
      // eslint-disable-next-line no-use-before-define
      if (gpuWantedNow()) await attachGpu(loadedInfer);
      // ~1-2 s: pick the performance tier this computer can keep up with (see pace).
      await pace.selfTest(loadedInfer);
      return loadedInfer;
    })();
    // If loading fails, clear the cache so a later call can retry.
    inferPromise.catch(() => {
      inferPromise = null;
    });
  }
  if (!sp) sp = SP.load();
  return inferPromise;
}

function isReady() {
  return modelManager.isReady();
}

// ---- GPU mode (see gpu-mode.js) ----
// State per computer in <userData>/voice-follow/gpu-mode.json:
//   { wanted: 'user' | 'auto' | null, userOff, check: { ok, reason, agree, speedup, int8Ms, gpuMs, key, at } }
const gpuStateFile = () => require('path').join(modelManager.modelDir(), 'gpu-mode.json'); // eslint-disable-line global-require
function gpuState() {
  try {
    return JSON.parse(require('fs').readFileSync(gpuStateFile(), 'utf8')); // eslint-disable-line global-require
  } catch (_) {
    return {};
  }
}
function saveGpuState(st) {
  try {
    // eslint-disable-next-line global-require
    const fs = require('fs');
    fs.mkdirSync(modelManager.modelDir(), { recursive: true });
    fs.writeFileSync(gpuStateFile(), JSON.stringify(st));
  } catch (_) {
    /* best effort: GPU mode just re-checks next time */
  }
}
const gpuKey = () => gpuMode.checkKey(require('onnxruntime-node').env.versions.node); // eslint-disable-line global-require
let gpuBusy = null; // the enable() in progress
let lastGpuError = null; // the last download / load error (not remembered across runs)

// Diagnostics: one line in errors.log (and the recorded session, when one is open). Never throws.
function gpuLog(event) {
  try {
    /* eslint-disable global-require */
    const { diag } = require('../shadow/diag');
    const { SHADOW_BUILD } = require('../shadow/config');
    const shadowBus = require('../shadow/bus');
    /* eslint-enable global-require */
    diag(`${event.type} ${JSON.stringify(event)}`);
    if (SHADOW_BUILD && shadowBus.active()) shadowBus.note(event);
  } catch (_) {
    /* logging never blocks the engine */
  }
}

function gpuWantedNow() {
  if (!gpuMode.supported()) return false;
  let st = gpuState();
  if (!st.wanted) return false; // the default: nothing else is read or loaded
  const crashed = gpuMode.afterCrash(st, gpuKey());
  if (crashed) {
    saveGpuState(crashed);
    gpuLog({ type: 'vf_gpu_check', source: 'launch', ...crashed.check });
    st = crashed;
  }
  return gpuMode.shouldUse(st, gpuKey(), modelManager.isGpuModelReady());
}

// A GPU step that could crash or hang the app: marked in the state file first, so the next launch
// knows (gpuMode.afterCrash) and never repeats it.
async function gpuStep(step, fn) {
  saveGpuState({ ...gpuState(), pending: step });
  try {
    return await fn();
  } finally {
    const { pending, ...rest } = gpuState();
    saveGpuState(rest);
  }
}

function onGpuFallback(e) {
  const error = String((e && e.message) || e).slice(0, 300);
  const st = gpuMode.afterFallback(gpuState());
  saveGpuState(st);
  gpuLog({ type: 'vf_gpu_fallback', error, fallbacks: st.fallbacks });
}

// Open the GPU session for a check that already passed; one reference window must come back
// without NaN, or this app run stays on the CPU.
async function attachGpu(infer) {
  let sess = null;
  try {
    await gpuStep('attach', async () => {
      sess = await Infer.createGpuSession(modelManager.gpuModelPath());
      const out = await Infer.runOn(sess, gpuMode.referenceWindows()[0]);
      if (gpuMode.hasNaN(out)) throw new Error('NaN in the GPU output');
    });
    infer.useGpu(sess, onGpuFallback);
    gpuLog({ type: 'vf_gpu_on', key: gpuKey() });
    return true;
  } catch (e) {
    Infer.releaseWhenIdle(sess, 5000);
    lastGpuError = String((e && e.message) || e).slice(0, 300);
    onGpuFallback(e);
    return false;
  }
}

// The self-check times the model, so it waits while Voice Autopilot is listening (live passes).
const IDLE_MS = 3000;
const listening = (infer) => infer.lastPassAt != null && Date.now() - infer.lastPassAt < IDLE_MS;
async function whenIdle(infer, onProgress) {
  while (listening(infer)) {
    onProgress({ step: 'waiting' });
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => {
      setTimeout(r, IDLE_MS);
    });
  }
}

// What the panel shows: { supported, wanted, active, check, error }.
function gpuStatus() {
  const st = gpuState();
  return {
    supported: gpuMode.supported(),
    wanted: st.wanted || null,
    active: !!(loadedInfer && loadedInfer.gpu),
    check: st.check && st.check.key === gpuKey() ? st.check : null,
    error: (loadedInfer && loadedInfer.gpuError) || lastGpuError,
    busy: !!gpuBusy,
  };
}

// Turn GPU mode on: download the fp32 model if needed, run the self-check, and use the graphics
// chip only if it passes. source: 'user' (the panel switch) or 'auto' (a "below" computer check).
// Call only while Voice Autopilot is not listening (the check times the model). Never throws.
async function enableGpu({ source = 'user', onProgress = () => {} } = {}) {
  if (gpuBusy) return gpuBusy;
  lastGpuError = null;
  gpuBusy = (async () => {
    const st = gpuState();
    if (!gpuMode.supported()) return gpuStatus();
    saveGpuState({
      ...st,
      wanted: source,
      userOff: false,
      ...(source === 'auto' ? { autoTried: gpuKey() } : {}),
    });
    try {
      onProgress({ step: 'download', share: 0 });
      await modelManager.ensureGpuModel((share) => onProgress({ step: 'download', share }));
    } catch (e) {
      // Not remembered as a failed check: the download can simply be tried again.
      lastGpuError = String((e && e.message) || e).slice(0, 300);
      gpuLog({ type: 'vf_gpu_download_failed', source, error: lastGpuError });
      return gpuStatus();
    }
    let infer;
    try {
      infer = await ready();
    } catch (e) {
      lastGpuError = String((e && e.message) || e).slice(0, 300);
      return gpuStatus();
    }
    if (infer.gpu) return gpuStatus();
    await whenIdle(infer, onProgress);
    onProgress({ step: 'check' });
    const file = modelManager.gpuModelPath();
    const open = async (kind) => {
      const sess =
        kind === 'gpu-fp32'
          ? await Infer.createGpuSession(file)
          : await Infer.createCpuSession(file);
      return { session: sess, run: (buf) => Infer.runOn(sess, buf), release: () => sess.release() };
    };
    const int8 = { run: (buf) => Infer.runOn(infer.cpuSession(), buf) };
    const startedAt = Date.now();
    const { result, gpu } = await gpuStep('check', () => gpuMode.selfCheck({ open, int8 }));
    if (infer.lastPassAt != null && infer.lastPassAt >= startedAt) {
      // Listening started during the check: its timing is not trustworthy; nothing is remembered.
      if (gpu) Infer.releaseWhenIdle(gpu.session);
      lastGpuError = 'busy';
      return gpuStatus();
    }
    const check = { ...result, key: gpuKey(), at: new Date().toISOString() };
    saveGpuState({ ...gpuState(), check, fallbacks: 0 });
    gpuLog({ type: 'vf_gpu_check', source, ...check });
    if (gpu) {
      infer.useGpu(gpu.session, onGpuFallback);
      gpuLog({ type: 'vf_gpu_on', key: check.key });
    } else {
      modelManager.removeGpuModel(); // 480 MB this computer cannot use
    }
    return gpuStatus();
  })();
  try {
    return await gpuBusy;
  } finally {
    gpuBusy = null;
  }
}

// Turn GPU mode off (the user's choice; auto never turns it back on). The fp32 model stays on
// disk, so turning it on again needs no download.
function disableGpu() {
  saveGpuState({ ...gpuState(), wanted: null, userOff: true });
  if (loadedInfer) loadedInfer.useCpu();
  gpuLog({ type: 'vf_gpu_off' });
  return gpuStatus();
}

// "Check this computer" finished: a PC below the minimum starts GPU mode on its own (once).
function noteHwCheck(hwResult, onProgress) {
  if (!gpuMode.autoWanted(hwResult, gpuState(), gpuKey())) return null;
  return enableGpu({ source: 'auto', onProgress });
}

// The ONNX session is up (ready() has completed once): a Start pays no model load.
function isLoaded() {
  return !!loadedInfer;
}

// Model-pass timing since the last call (null until the session is loaded); see Infer.
function perfStats() {
  return loadedInfer ? loadedInfer.perfStats() : null;
}

async function createRecognizer(opts = {}) {
  const infer = await ready(opts.onProgress);
  return new Recognizer(infer, opts);
}

async function createFollower(lines, opts = {}) {
  const infer = await ready(opts.onProgress);
  if (!sp) sp = SP.load();
  return new Follower(infer, sp, lines, opts);
}

// Paath follower (Banis only): tracks the reader's position in the whole Bani, with a
// strong next-line prior, so fast reading never falls behind. lines carry
// { verseId, words, text } (text = the line's Unicode Gurmukhi, numerals intact).
// opts.baniId: the Bani being followed, left out of the "other Gurbani" it is checked
// against. Shabads (kirtan, Hukamnama) keep createFollower.
async function createPaathFollower(lines, opts = {}) {
  const infer = await ready(opts.onProgress);
  const background = Object.entries(NITNEM)
    .filter(([id]) => Number(id) !== Number(opts.baniId))
    .flatMap(([, l]) => l);
  return new FollowerV2(infer, lines, { background, ...opts });
}

module.exports = {
  ready,
  isReady,
  isLoaded,
  perfStats,
  createRecognizer,
  createFollower,
  createPaathFollower,
  // Performance tiers (self-test, live stepping, tier for the session log).
  pace,
  // Text helpers reused by the supervisor for acoustic switch-scoring: `norm`
  // strips whitespace/punctuation the way the follower does, and `partialRatio`
  // is the same fuzzy matcher, so a shabad scored here is comparable to the
  // follower's own line confidences.
  norm,
  partialRatio,
  // GPU mode (opt-in; see gpu-mode.js).
  gpu: { status: gpuStatus, enable: enableGpu, disable: disableGpu, noteHwCheck },
  modelPath: modelManager.modelPath,
  modelDir: modelManager.modelDir,
};
