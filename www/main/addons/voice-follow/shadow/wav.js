// Turns a session's recorded audio segments (Opus in WebM, written by MediaRecorder) into
// one 16 kHz mono 16-bit WAV file, the form the team's Hugging Face datasets use. Runs in
// the renderer (Web Audio decodes and resamples); one segment at a time, so a two-hour
// service never needs more than a few MB of memory at once.
const fs = require('fs');
const path = require('path');

const RATE = 16000;

const wavHeader = (samples) => {
  const b = Buffer.alloc(44);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + samples * 2, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); // PCM chunk size
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 2, 28); // byte rate
  b.writeUInt16LE(2, 32); // block align
  b.writeUInt16LE(16, 34); // bits per sample
  b.write('data', 36);
  b.writeUInt32LE(samples * 2, 40);
  return b;
};

async function decode(file) {
  const raw = fs.readFileSync(file);
  const ctx = new OfflineAudioContext(1, 1, RATE); // decodeAudioData resamples to RATE
  const audio = await ctx.decodeAudioData(
    raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
  );
  const ch = audio.getChannelData(0);
  const out = Buffer.alloc(ch.length * 2);
  for (let i = 0; i < ch.length; i += 1) {
    const v = Math.max(-1, Math.min(1, ch[i]));
    out.writeInt16LE(Math.round(v < 0 ? v * 32768 : v * 32767), i * 2);
  }
  return out;
}

// Writes <dir>/<name>.wav from the session's audio-NNN.webm files, in order. Returns the
// duration in seconds. A segment that will not decode (a crash mid-write) is skipped.
async function sessionToWav(dir, name) {
  const segs = fs
    .readdirSync(dir)
    .filter((f) => /^audio-\d+\.webm$/.test(f))
    .sort();
  const out = path.join(dir, `${name}.wav`);
  const fd = fs.openSync(`${out}.part`, 'w');
  let samples = 0;
  try {
    fs.writeSync(fd, wavHeader(0));
    // eslint-disable-next-line no-restricted-syntax
    for (const f of segs) {
      let pcm = null;
      try {
        // eslint-disable-next-line no-await-in-loop
        pcm = await decode(path.join(dir, f));
      } catch (_) {
        pcm = null;
      }
      if (pcm && pcm.length) {
        fs.writeSync(fd, pcm);
        samples += pcm.length / 2;
      }
    }
    fs.writeSync(fd, wavHeader(samples), 0, 44, 0);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(`${out}.part`, out);
  return samples / RATE;
}

module.exports = { sessionToWav, RATE };
