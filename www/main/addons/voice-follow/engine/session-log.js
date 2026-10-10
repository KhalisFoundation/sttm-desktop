// On-device record of what Voice-Follow decided and what the sevadaar corrected.
//  - events.jsonl : one JSON line per decision (ids and timings only; never audio
//                   or recognised text). This is the field version of the benchmark
//                   trace, so a session log scores with the same tools.
//  - corrections/ : when the sevadaar has opted in, the last N seconds of audio
//                   before a tap plus a JSON sidecar naming the shabad they chose.
//                   A correction is a human-labelled hard example: exactly the data
//                   the recogniser and the judge need to get better.
// Everything stays under the app's user-data folder. Nothing is uploaded here.
const fs = require('fs');
const path = require('path');
const { modelDir } = require('./model-manager');

function baseDir() {
  const d = modelDir(); // <userData>/voice-follow
  try {
    fs.mkdirSync(d, { recursive: true });
  } catch (_) {
    /* best effort */
  }
  return d;
}

let appVersion = null;
function version() {
  if (appVersion != null) return appVersion;
  try {
    // eslint-disable-next-line global-require
    appVersion = require('@electron/remote').app.getVersion();
  } catch (_) {
    appVersion = '';
  }
  return appVersion;
}

// Append one event. Never throws; logging must not disturb following.
function logEvent(type, fields = {}) {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), type, v: version(), ...fields });
    fs.appendFile(path.join(baseDir(), 'events.jsonl'), `${line}\n`, () => {});
  } catch (_) {
    /* never disturb the session */
  }
}

// Rolling buffer of the most recent `seconds` of mono float PCM.
function createRing(seconds, sampleRate) {
  const size = Math.max(1, Math.floor(seconds * sampleRate));
  const buf = new Float32Array(size);
  let write = 0;
  let filled = 0;
  return {
    sampleRate,
    push(chunk) {
      if (!chunk || !chunk.length) return;
      let src = chunk;
      if (src.length > size) src = src.subarray(src.length - size);
      const first = Math.min(src.length, size - write);
      buf.set(src.subarray(0, first), write);
      if (first < src.length) buf.set(src.subarray(first), 0);
      write = (write + src.length) % size;
      filled = Math.min(size, filled + src.length);
    },
    snapshot() {
      const out = new Float32Array(filled);
      if (filled < size) out.set(buf.subarray(0, filled));
      else {
        out.set(buf.subarray(write), 0);
        out.set(buf.subarray(0, write), size - write);
      }
      return out;
    },
  };
}

function wavBytes(pcm, sampleRate) {
  const n = pcm.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(sampleRate, 24);
  b.writeUInt32LE(sampleRate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i += 1) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    b.writeInt16LE(s < 0 ? s * 32768 : s * 32767, 44 + i * 2);
  }
  return b;
}

// Save the audio leading up to a correction plus what the sevadaar chose.
// Returns the base path written, or null.
function saveCorrection(pcm, sampleRate, meta) {
  try {
    if (!pcm || !pcm.length) return null;
    const dir = path.join(baseDir(), 'corrections');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = path.join(dir, stamp);
    fs.writeFileSync(`${base}.wav`, wavBytes(pcm, sampleRate));
    fs.writeFileSync(
      `${base}.json`,
      JSON.stringify(
        {
          ts: new Date().toISOString(),
          v: version(),
          sampleRate,
          seconds: pcm.length / sampleRate,
          ...meta,
        },
        null,
        1,
      ),
    );
    return base;
  } catch (_) {
    return null;
  }
}

function logDir() {
  return baseDir();
}

module.exports = { logEvent, createRing, saveCorrection, logDir };
