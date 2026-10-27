// Downloads + caches the karansea CTC model so voice-follow needs zero user
// setup. On first use we fetch the 184 MB int8 model from Hugging Face (public,
// MIT) into the app's userData dir; subsequent runs use the cached copy.
const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const crypto = require('crypto');

const MODEL_FILE = 'model.int8.onnx';
const MODEL_BYTES = 184311219; // known size; used to detect a truncated download
const MODEL_URL =
  'https://huggingface.co/karansea/indicconformer-stt-pa-ctc-shabad-preview/resolve/main/model.int8.onnx?download=true';

// GPU mode only (engine/gpu-mode.js): the same model in full precision (fp32), which the graphics
// chip runs (int8 is slower there). Downloaded only when GPU mode is wanted, never bundled; pinned to
// one Hugging Face revision and checked by size and SHA-256 before it is used.
const GPU_MODEL_FILE = 'model.fp32.onnx';
const GPU_MODEL_BYTES = 479742667;
const GPU_MODEL_SHA256 = '5ba46679b8956cff6bd9dfdb83632ca9c3021539f4decb530427faa7740b242b';
const GPU_MODEL_URL =
  'https://huggingface.co/karansea/indicconformer-stt-pa-ctc-shabad-preview/resolve/5fd2e89e3a43d31f47b0fb55fdce5ed50a91283f/model.onnx?download=true';

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

// A copy shipped inside the installer (tester builds bundle it so a Gurdwara never has
// to download 184 MB). Used when present and complete; otherwise the per-user download.
function bundledModelPath() {
  try {
    const res = process.resourcesPath;
    return res ? path.join(res, 'voice-follow', MODEL_FILE) : null;
  } catch (_) {
    return null;
  }
}

function modelPath() {
  const bundled = bundledModelPath();
  // eslint-disable-next-line no-use-before-define
  if (bundled && isComplete(bundled)) return bundled;
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

// idleMs > 0 (GPU model only): give up when no data arrives for that long, so a stalled download
// cannot hold the panel forever; the partial file is removed. 0 = the int8 model's behaviour.
function download(url, dest, onProgress, redirects = 0, idleMs = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error('too many redirects'));
      return;
    }
    const req = https.get(url, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        resolve(download(res.headers.location, dest, onProgress, redirects + 1, idleMs));
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
      // GPU model: close the partial file when the response breaks off (so it can be removed).
      if (idleMs > 0) {
        res.on('close', () => {
          if (res.complete) return;
          out.destroy();
          reject(new Error('download interrupted'));
        });
      }
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
    if (idleMs > 0) {
      req.setTimeout(idleMs, () => req.destroy(new Error('download stalled')));
    }
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

function gpuModelPath() {
  return path.join(modelDir(), GPU_MODEL_FILE);
}

// Frees the 480 MB when the graphics chip did not pass its check.
function removeGpuModel() {
  [gpuModelPath(), `${gpuModelPath()}.part`].forEach((f) => {
    try {
      fs.unlinkSync(f);
    } catch (_) {
      /* not there */
    }
  });
}

function isGpuModelReady() {
  const file = gpuModelPath();
  try {
    return fs.statSync(file).size === GPU_MODEL_BYTES;
  } catch (_) {
    return false;
  }
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file)
      .on('data', (d) => h.update(d))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject);
  });
}

// The fp32 model for GPU mode; same download path as the int8 model, plus a SHA-256 check the first
// time (a wrong file is deleted, so the next try downloads it again). onProgress(0..1).
async function ensureGpuModel(onProgress) {
  if (isGpuModelReady()) return gpuModelPath();
  fs.mkdirSync(modelDir(), { recursive: true });
  // 480 MB plus 1 GB to spare (statfs is missing on old Node versions: then just try).
  let free = null;
  try {
    const st = fs.statfsSync(modelDir());
    free = st.bavail * st.bsize;
  } catch (_) {
    free = null;
  }
  if (free != null && free < GPU_MODEL_BYTES + 1024 ** 3) throw new Error('not enough disk space');
  const dest = gpuModelPath();
  try {
    await download(
      GPU_MODEL_URL,
      dest,
      (r, t) => {
        if (onProgress) onProgress(r / t);
      },
      0,
      30000,
    );
  } catch (e) {
    try {
      fs.unlinkSync(`${dest}.part`);
    } catch (_) {
      /* nothing partial left */
    }
    throw e;
  }
  if (!isGpuModelReady() || (await sha256(dest)) !== GPU_MODEL_SHA256) {
    try {
      fs.unlinkSync(dest);
    } catch (_) {
      /* already gone */
    }
    throw new Error('downloaded GPU model is incomplete or damaged');
  }
  return dest;
}

module.exports = {
  ensureModel,
  isReady,
  modelPath,
  modelDir,
  MODEL_URL,
  ensureGpuModel,
  isGpuModelReady,
  gpuModelPath,
  removeGpuModel,
  GPU_MODEL_URL,
  GPU_MODEL_BYTES,
};
