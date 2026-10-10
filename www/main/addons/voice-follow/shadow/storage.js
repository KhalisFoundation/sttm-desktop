// Keeps the shadow recordings from filling the laptop. Uncompressed audio is ~115 MB per hour,
// so local audio is deleted once it is safe in both places, and recording holds off when the
// disk is low. Nothing that has not reached Azure is ever deleted.
//   - Azure has every file of the session and Hugging Face has it (or no HF key is set and
//     the local store is over SHADOW_KEEP_BYTES): the audio and the HF build files go; the
//     small logs stay.
//   - Free disk below SHADOW_MIN_FREE_START_BYTES: no new session starts; below
//     SHADOW_MIN_FREE_RUN_BYTES a running session stops.
const fs = require('fs');
const path = require('path');
const {
  SHADOW_KEEP_BYTES,
  SHADOW_MIN_FREE_START_BYTES,
  SHADOW_MIN_FREE_RUN_BYTES,
} = require('./config');

const readJson = (f, d) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (_) {
    return d;
  }
};

function freeBytes(dir) {
  try {
    const s = fs.statfsSync(dir);
    return s.bavail * s.bsize;
  } catch (_) {
    return Infinity; // unknown: do not block recording on it
  }
}
const canStart = (dir) => freeBytes(dir) >= SHADOW_MIN_FREE_START_BYTES;
const mustStop = (dir) => freeBytes(dir) < SHADOW_MIN_FREE_RUN_BYTES;

const isAudio = (f) => /^audio-(pre|\d+)\.(wav|webm)$/.test(f);
const sizeOf = (full) => {
  try {
    const st = fs.statSync(full);
    if (!st.isDirectory()) return st.size;
    return fs.readdirSync(full).reduce((a, f) => a + sizeOf(path.join(full, f)), 0);
  } catch (_) {
    return 0;
  }
};

// Every file of the session is on Azure at its current size.
function onAzure(dir) {
  const done = readJson(path.join(dir, 'uploaded.json'), {});
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f !== 'uploaded.json' && fs.statSync(path.join(dir, f)).isFile())
      .every((f) => done[f] === fs.statSync(path.join(dir, f)).size);
  } catch (_) {
    return false;
  }
}

function dropAudio(dir) {
  fs.readdirSync(dir)
    .filter(isAudio)
    .forEach((f) => fs.rmSync(path.join(dir, f), { force: true }));
  fs.rmSync(path.join(dir, 'hf'), { recursive: true, force: true });
  fs.writeFileSync(
    path.join(dir, 'audio-removed.json'),
    JSON.stringify({ at: new Date().toISOString() }, null, 1),
  );
}

// Run every upload tick. `live` is the session being recorded (never touched); `hfOn` says
// whether a Hugging Face key is set (without one, audio waits for it, within the budget).
function sweep(root, live, hfOn, log = () => {}) {
  if (!root || !fs.existsSync(root)) return;
  const sessions = fs
    .readdirSync(root)
    .map((id) => path.join(root, id))
    .filter((d) => d !== live && fs.statSync(d).isDirectory())
    .filter((d) => !fs.existsSync(path.join(d, 'audio-removed.json')))
    .sort(); // oldest first
  sessions.forEach((d) => {
    if (!onAzure(d)) return;
    if (fs.existsSync(path.join(d, 'hf-pushed.json'))) {
      dropAudio(d);
      log(`storage: ${path.basename(d)} is on Azure and Hugging Face, local audio removed`);
    }
  });
  // Over budget (no HF key, so audio is piling up): drop the oldest that are on Azure.
  let total = sizeOf(root);
  sessions
    .filter((d) => fs.existsSync(d) && !fs.existsSync(path.join(d, 'audio-removed.json')))
    .forEach((d) => {
      if (total <= SHADOW_KEEP_BYTES || !onAzure(d)) return;
      const before = sizeOf(d);
      dropAudio(d);
      total -= before - sizeOf(d);
      log(
        `storage: over ${Math.round(SHADOW_KEEP_BYTES / 1e9)} GB, removed audio of ${path.basename(d)} (on Azure${hfOn ? '' : '; no Hugging Face key yet'})`,
      );
    });
}

module.exports = { sweep, canStart, mustStop, freeBytes, onAzure };
