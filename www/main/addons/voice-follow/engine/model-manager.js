// Downloads + caches the karansea CTC model so voice-follow needs zero user
// setup. On first use we fetch the 184 MB int8 model from Hugging Face (public,
// MIT) into the app's userData dir; subsequent runs use the cached copy.
const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

const MODEL_FILE = 'model.int8.onnx';
const MODEL_BYTES = 184311219; // known size; used to detect a truncated download
const MODEL_URL =
  'https://huggingface.co/karansea/indicconformer-stt-pa-ctc-shabad-preview/resolve/main/model.int8.onnx?download=true';

function modelDir() {
  // Lazy require so this module is usable outside Electron (tests).
  // eslint-disable-next-line global-require
  const { app } = require('electron');
  // Electron exposes app directly in main and through remote in this renderer.
  // eslint-disable-next-line global-require
  const electronApp = app || (process.type === 'renderer' ? require('@electron/remote').app : null);
  const base = electronApp ? electronApp.getPath('userData') : path.join(os.tmpdir(), 'sttm');
  return path.join(base, 'voice-follow');
}

function modelPath() {
  return path.join(modelDir(), MODEL_FILE);
}

function isComplete(file) {
  try {
    return fs.statSync(file).size === MODEL_BYTES;
  } catch (_) {
    return false;
  }
}

function isReady() {
  return isComplete(modelPath());
}

function download(url, dest, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error('too many redirects'));
      return;
    }
    const req = https.get(url, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        resolve(download(res.headers.location, dest, onProgress, redirects + 1));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`download failed: HTTP ${res.statusCode}`));
        return;
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;
      const tmp = `${dest}.part`;
      const out = fs.createWriteStream(tmp);
      res.on('data', (chunk) => {
        received += chunk.length;
        if (onProgress && total) onProgress(received, total);
      });
      res.pipe(out);
      out.on('finish', () =>
        out.close(() => {
          try {
            fs.renameSync(tmp, dest);
            resolve(dest);
          } catch (e) {
            reject(e);
          }
        }),
      );
      out.on('error', (e) => {
        try {
          fs.unlinkSync(tmp);
        } catch (_) {
          /* A failed download may already have removed the partial file. */
        }
        reject(e);
      });
    });
    req.on('error', reject);
  });
}

// Ensure the model exists locally; download it if missing. onProgress(0..1).
async function ensureModel(onProgress) {
  if (isReady()) return modelPath();
  fs.mkdirSync(modelDir(), { recursive: true });
  // Earlier renderer versions accidentally used the plain-Node temporary path.
  // Preserve that cache while copying it atomically into the persistent profile.
  const legacy = path.join(os.tmpdir(), 'sttm', 'voice-follow', MODEL_FILE);
  const dest = modelPath();
  if (legacy !== dest && isComplete(legacy)) {
    const temporary = `${dest}.${process.pid}.migrate.part`;
    try {
      fs.copyFileSync(legacy, temporary);
      if (!isComplete(temporary)) throw new Error('cached model migration is incomplete');
      fs.renameSync(temporary, dest);
    } catch (e) {
      try {
        fs.unlinkSync(temporary);
      } catch (_) {
        /* No partial copy to remove. */
      }
      throw e;
    }
    return dest;
  }
  await download(MODEL_URL, modelPath(), (r, t) => {
    if (onProgress) onProgress(r / t);
  });
  if (!isReady()) throw new Error('downloaded model is incomplete');
  return modelPath();
}

module.exports = { ensureModel, isReady, modelPath, modelDir, MODEL_URL };
