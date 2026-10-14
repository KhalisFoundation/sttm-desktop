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
const { partialRatio } = require('./fuzz');
const modelManager = require('./model-manager');

let inferPromise = null; // shared session (load the model once)
let sp = null;           // tokenizer is cheap + stateless, share it too

// Ensure the model is present and the ONNX session is loaded. onProgress(0..1)
// is called during download only. Safe to call repeatedly — work happens once.
async function ready(onProgress) {
  if (!inferPromise) {
    inferPromise = (async () => {
      const modelPath = await modelManager.ensureModel(onProgress);
      return Infer.create(modelPath);
    })();
    // If loading fails, clear the cache so a later call can retry.
    inferPromise.catch(() => { inferPromise = null; });
  }
  if (!sp) sp = SP.load();
  return inferPromise;
}

function isReady() {
  return modelManager.isReady();
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

module.exports = {
  ready,
  isReady,
  createRecognizer,
  createFollower,
  // Text helpers reused by the supervisor for acoustic switch-scoring: `norm`
  // strips whitespace/punctuation the way the follower does, and `partialRatio`
  // is the same fuzzy matcher, so a shabad scored here is comparable to the
  // follower's own line confidences.
  norm,
  partialRatio,
  modelPath: modelManager.modelPath,
  modelDir: modelManager.modelDir,
};
