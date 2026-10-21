// Records a microphone stream straight to an uncompressed 16 kHz mono 16-bit WAV file, the
// way the team's recorder captures training audio (no lossy compression in between). The
// browser's own resampler brings the microphone down to 16 kHz. The WAV header is rewritten
// every few seconds, so a crash or power cut leaves a valid file missing only those seconds.
const fs = require('fs');

const RATE = 16000;
const HEADER_EVERY = RATE * 5; // samples between header rewrites

function header(samples, rate) {
  const b = Buffer.alloc(44);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + samples * 2, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(samples * 2, 40);
  return b;
}

// Starts writing `stream` to `file`. Returns { stop() } (stop finalises the header).
function record(stream, file) {
  let ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: RATE });
  } catch (_) {
    ctx = new (window.AudioContext || window.webkitAudioContext)(); // device rate; noted in header
  }
  const rate = Math.round(ctx.sampleRate);
  const src = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const fd = fs.openSync(file, 'w');
  fs.writeSync(fd, header(0, rate));
  let samples = 0;
  let lastHeader = 0;
  let open = true;
  node.onaudioprocess = (e) => {
    if (!open) return;
    const x = e.inputBuffer.getChannelData(0);
    const b = Buffer.alloc(x.length * 2);
    for (let i = 0; i < x.length; i += 1) {
      const v = Math.max(-1, Math.min(1, x[i]));
      b.writeInt16LE(Math.round(v < 0 ? v * 32768 : v * 32767), i * 2);
    }
    try {
      fs.writeSync(fd, b);
      samples += x.length;
      if (samples - lastHeader >= HEADER_EVERY) {
        lastHeader = samples;
        fs.writeSync(fd, header(samples, rate), 0, 44, 0);
      }
    } catch (_) {
      /* disk full or file gone: the session's own checks deal with it */
    }
  };
  src.connect(node);
  node.connect(ctx.destination); // runs only while connected; its output is silent
  return {
    rate,
    stop() {
      if (!open) return;
      open = false;
      try {
        src.disconnect();
        node.disconnect();
      } catch (_) {
        /* already gone */
      }
      try {
        fs.writeSync(fd, header(samples, rate), 0, 44, 0);
        fs.closeSync(fd);
      } catch (_) {
        /* ignore */
      }
      ctx.close().catch(() => {});
    },
  };
}

module.exports = { record, header, RATE };
