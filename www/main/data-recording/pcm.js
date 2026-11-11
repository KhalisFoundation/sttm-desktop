// Records a microphone stream straight to uncompressed 16 kHz mono 16-bit WAV files, the
// way the team's recorder captures training audio (no lossy compression in between). The
// browser's own resampler brings the microphone down to 16 kHz. The WAV header is rewritten
// every few seconds, so a crash or power cut leaves a valid file missing only those seconds.
//
// The samples are taken on the audio thread (an AudioWorklet), not on the page's main
// thread: when the page is busy (Autopilot catching up, a slow laptop) the chunks wait in
// a queue instead of being dropped or glitched, as they were with a ScriptProcessor. Files
// are written asynchronously at fixed offsets. One recorder runs for the whole session and
// moves from file to file without a gap; chunks that arrive between two files are held and
// open the next one.
const fs = require('fs');

const RATE = 16000;
const HEADER_EVERY = RATE * 5; // samples between header rewrites
const CHUNK = 2048; // samples per message from the audio thread (128 ms at 16 kHz)
const HOLD_S = 60; // seconds held while no file is open; older ones are lost

const WORKLET_SRC = `
class ShadowPcm extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Int16Array(${CHUNK});
    this.n = 0;
    this.next = -1;
    this.gaps = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    // A render quantum with no input in between (the stream stalled or ended) is a gap.
    if (this.next >= 0 && currentFrame !== this.next) this.gaps += 1;
    this.next = currentFrame + ch.length;
    for (let i = 0; i < ch.length; i += 1) {
      const v = Math.max(-1, Math.min(1, ch[i]));
      this.buf[this.n++] = Math.round(v < 0 ? v * 32768 : v * 32767);
      if (this.n === this.buf.length) {
        const end = currentTime + (i + 1) / sampleRate;
        this.port.postMessage({ pcm: this.buf.buffer, end, gaps: this.gaps }, [this.buf.buffer]);
        this.buf = new Int16Array(${CHUNK});
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor('shadow-pcm', ShadowPcm);
`;

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

function context() {
  const AC = window.AudioContext || window.webkitAudioContext;
  try {
    return new AC({ sampleRate: RATE });
  } catch (_) {
    return new AC(); // device rate; noted in each header
  }
}

// Starts taking samples from `stream`. onChunk(Int16Array), if given, sees every chunk;
// holdSeconds: 0 for a recorder that never writes a file (the listener).
// Resolves to a recorder: begin(file) starts a WAV file, end() finishes it (resolves once
// it is closed, with its sample count), setStream(stream) swaps in a new microphone,
// health() reports how complete the recording is, close() stops everything.
async function open(stream, { onChunk, holdSeconds = HOLD_S } = {}) {
  const ctx = context();
  const rate = Math.round(ctx.sampleRate);
  const holdMax = holdSeconds * rate;
  const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
  try {
    await ctx.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  const node = new AudioWorkletNode(ctx, 'shadow-pcm');
  let src = ctx.createMediaStreamSource(stream);
  src.connect(node);
  node.connect(ctx.destination); // keeps it pulled; its output is silent
  const openedAt = Date.now();
  const h = { samples: 0, gaps: 0, maxLagMs: 0, lostSamples: 0, writeErrors: 0 };
  let file = null; // the WAV being written: { write(pcm), end() }
  let held = [];
  let heldSamples = 0;
  let closed = false;

  // One WAV file. Writes go to fixed offsets, so they need not finish in order.
  const wav = (fd) => {
    let samples = 0;
    let lastHeader = 0;
    let pending = 0;
    let done = null;
    const close = () => {
      try {
        fs.closeSync(fd);
      } catch (_) {
        /* already closed */
      }
      done(samples);
    };
    const settle = (err) => {
      if (err) h.writeErrors += 1; // disk full or file gone: the session's checks deal with it
      pending -= 1;
      if (done && !pending) close();
    };
    return {
      write(pcm) {
        const b = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
        const at = 44 + samples * 2;
        samples += pcm.length;
        pending += 1;
        fs.write(fd, b, 0, b.length, at, settle);
        if (samples - lastHeader >= HEADER_EVERY) {
          lastHeader = samples;
          pending += 1;
          fs.write(fd, header(samples, rate), 0, 44, 0, settle);
        }
      },
      // The final header goes down at once, so even a page that dies next leaves a whole file.
      end() {
        return new Promise((resolve) => {
          try {
            fs.writeSync(fd, header(samples, rate), 0, 44, 0);
          } catch (_) {
            h.writeErrors += 1;
          }
          done = resolve;
          if (!pending) close();
        });
      },
    };
  };

  node.port.onmessage = ({ data }) => {
    if (closed) return;
    const pcm = new Int16Array(data.pcm);
    h.samples += pcm.length;
    h.gaps = data.gaps;
    const lag = (ctx.currentTime - data.end) * 1000;
    if (lag > h.maxLagMs) h.maxLagMs = Math.round(lag);
    if (onChunk) onChunk(pcm);
    if (file) {
      file.write(pcm);
      return;
    }
    held.push(pcm);
    heldSamples += pcm.length;
    while (heldSamples > holdMax) {
      const old = held.shift();
      heldSamples -= old.length;
      if (holdSeconds) h.lostSamples += old.length;
    }
  };

  const end = () => {
    const f = file;
    file = null;
    return f ? f.end() : Promise.resolve(0);
  };

  return {
    rate,
    begin(path) {
      if (closed) return;
      end();
      const fd = fs.openSync(path, 'w');
      fs.writeSync(fd, header(0, rate));
      file = wav(fd);
      held.forEach((pcm) => file.write(pcm));
      held = [];
      heldSamples = 0;
    },
    end,
    setStream(next) {
      try {
        src.disconnect();
      } catch (_) {
        /* already gone */
      }
      src = ctx.createMediaStreamSource(next);
      src.connect(node);
    },
    // samples kept vs the wall clock since the recorder opened (1.0 = nothing missing).
    health() {
      const wallSeconds = (Date.now() - openedAt) / 1000;
      const seconds = h.samples / rate;
      return {
        rate,
        seconds: Math.round(seconds * 10) / 10,
        wallSeconds: Math.round(wallSeconds * 10) / 10,
        coverage: wallSeconds > 0 ? Math.round((seconds / wallSeconds) * 1000) / 1000 : 1,
        gaps: h.gaps,
        maxLagMs: h.maxLagMs,
        lostSeconds: Math.round((h.lostSamples / rate) * 10) / 10,
        writeErrors: h.writeErrors,
      };
    },
    close() {
      if (closed) return Promise.resolve(0);
      const done = end();
      closed = true;
      node.port.onmessage = null;
      try {
        src.disconnect();
        node.disconnect();
      } catch (_) {
        /* already gone */
      }
      ctx.close().catch(() => {});
      return done;
    },
  };
}

module.exports = { open, header, RATE };
