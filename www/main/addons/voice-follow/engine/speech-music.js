// Speech or singing? Google's YAMNet (AudioSet sound classifier, Apache 2.0; an unmodified
// ONNX export) tells spoken audio (Ardas, katha, announcements) from kirtan, which the
// Gurbani model cannot: katha about a Shabad shares its words. Optional: downloaded once in
// the background (16 MB, size and SHA-256 checked) and, until it is there or if it fails,
// Voice Autopilot works exactly as without it.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const modelManager = require('./model-manager');
const { resampleTo16k } = require('./infer');

const FILE = 'yamnet.onnx';
const BYTES = 16093355;
const SHA256 = 'd3835ffbbd4a1bb3e777f0ca217b5007907f5171dd5d17c4236b95b2af8f908e';
const URL =
  'https://huggingface.co/audiomagic/yamnet-onnx/resolve/f25b741c2f0bdc6d7e6db24b5fddda23347dbafd/yamnet.onnx';
// AudioSet class indices (yamnet_class_map.csv): speech, conversation, narration; music,
// musical instrument; singing, chant. (Paath read together keeps a singing/chant score
// near 0.3; Ardas, katha and announcements stay near 0.)
const SPEECH = [0, 1, 2, 3];
const MUSIC = [132, 133];
const SINGING = [24, 27];

let ortModule = null;
const ort = () => {
  // eslint-disable-next-line global-require
  if (!ortModule) ortModule = require('onnxruntime-node');
  return ortModule;
};

const filePath = () => process.env.VF_SPEECH_MODEL || path.join(modelManager.modelDir(), FILE);
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const isComplete = (file) => {
  try {
    return fs.statSync(file).size === BYTES;
  } catch (_) {
    return false;
  }
};

let sessionPromise = null;
let session = null;

// Load (downloading first if needed) once; resolves null when it cannot be had.
function ensure() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const file = filePath();
      if (!isComplete(file)) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        await modelManager.download(URL, file);
        if (!isComplete(file) || sha256(file) !== SHA256) {
          fs.unlinkSync(file);
          throw new Error('speech model download did not verify');
        }
      }
      session = await ort().InferenceSession.create(file, {
        intraOpNumThreads: 1,
        interOpNumThreads: 1,
      });
      return session;
    })().catch(() => {
      sessionPromise = null;
      return null;
    });
  }
  return sessionPromise;
}

// pcm: Float32Array of mono audio at sampleRate (about 2 s). Resolves { speech, music,
// singing } (mean class scores) or null when the model is not loaded.
async function classify(raw, sampleRate) {
  if (!session || !raw) return null;
  const pcm = sampleRate && sampleRate !== 16000 ? resampleTo16k(raw, sampleRate) : raw;
  if (pcm.length < 16000) return null;
  const r = await session.run({
    [session.inputNames[0]]: new (ort().Tensor)('float32', pcm, [pcm.length]),
  });
  const sc = r[session.outputNames[0]];
  const [n, k] = sc.dims;
  const mean = (ids) => {
    let s = 0;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < ids.length; j += 1) s += sc.data[i * k + ids[j]];
    }
    return s / (n || 1);
  };
  return { speech: mean(SPEECH), music: mean(MUSIC), singing: mean(SINGING) };
}

const loaded = () => !!session;

module.exports = { ensure, classify, loaded };
