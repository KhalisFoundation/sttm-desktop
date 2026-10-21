// Records a microphone stream straight to an uncompressed 16 kHz mono 16-bit WAV file, the
// way the team's recorder captures training audio (no lossy compression in between). The
// browser's own resampler brings the microphone down to 16 kHz. The WAV header is rewritten
// every few seconds, so a crash or power cut leaves a valid file missing only those seconds.
//
// Samples are captured on the audio thread (AudioWorklet). The old ScriptProcessor ran its
// callback on the renderer's main thread, so whenever React or the search held that thread
// the browser dropped or repeated whole buffers: recordings had skipped and doubled words.
// If the worklet cannot load, it falls back to that ScriptProcessor (one line in errors.log).
const fs = require('fs');
const { diag, guard } = require('./diag');

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

// Float samples [-1, 1] to 16-bit little-endian PCM, exactly as the recorder always wrote them.
function toInt16(x) {
  const b = Buffer.alloc(x.length * 2);
  for (let i = 0; i < x.length; i += 1) {
    const v = Math.max(-1, Math.min(1, x[i]));
    b.writeInt16LE(Math.round(v < 0 ? v * 32768 : v * 32767), i * 2);
  }
  return b;
}

// The audio thread stamps every chunk with the audio clock's frame number of its first
// sample. Laying chunks at those frames keeps sample N of the file at audio-clock frame N
// (frame 0 = when the recorder started), so the file stays aligned with system.jsonl and
// human.jsonl even if a chunk never arrives: a hole becomes silence of the same length
// (what the old recorder wrote for a silent input) and an overlap is trimmed, never
// written twice. Holes longer than MAX_GAP_S are not padded (a broken clock, not audio).
const MAX_GAP_S = 60;
function assembler(rate) {
  let next = null; // frame expected next; null until the first chunk
  const stats = { gaps: 0, gapSamples: 0, overlaps: 0, overlapSamples: 0 };
  return {
    stats,
    // Returns the Buffers to append, in order (padding first, then the chunk's new samples).
    push(frame, x) {
      const out = [];
      if (next === null) next = 0; // the recorder starts at frame 0 of its own clock
      let from = 0;
      if (frame > next) {
        const gap = frame - next;
        if (gap <= MAX_GAP_S * rate) {
          stats.gaps += 1;
          stats.gapSamples += gap;
          out.push(Buffer.alloc(gap * 2));
        }
      } else if (frame < next) {
        from = Math.min(x.length, next - frame);
        stats.overlaps += 1;
        stats.overlapSamples += from;
      }
      if (from < x.length) out.push(toInt16(from ? x.subarray(from) : x));
      next = Math.max(next, frame + x.length);
      return out;
    },
  };
}

// Runs on the audio thread, so React or any other work blocking the renderer cannot make it
// miss audio: chunks queue on the port until the main thread is free to write them.
const CHUNK = 1024; // 64 ms at 16 kHz
const WORKLET_SRC = `
class ShadowPcm extends AudioWorkletProcessor {
  constructor() { super(); this._buf = new Float32Array(${CHUNK}); this._n = 0; this._at = 0; this._on = true;
    this.port.onmessage = (e) => { if (e.data === 'stop') this._on = false; }; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    // A hole in the input (no channel this quantum): send what is held, so every chunk is
    // one unbroken run of samples starting at its stamped frame.
    if (this._n && (!ch || currentFrame !== this._at + this._n)) {
      this.port.postMessage({ frame: this._at, pcm: this._buf.slice(0, this._n) });
      this._n = 0;
    }
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        if (this._n === 0) this._at = currentFrame + i;
        this._buf[this._n++] = ch[i];
        if (this._n === this._buf.length) {
          const out = this._buf;
          this.port.postMessage({ frame: this._at, pcm: out }, [out.buffer]);
          this._buf = new Float32Array(${CHUNK});
          this._n = 0;
        }
      }
    }
    return this._on;
  }
}
registerProcessor('shadow-pcm', ShadowPcm);
`;

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
  const fd = fs.openSync(file, 'w');
  fs.writeSync(fd, header(0, rate));
  let samples = 0;
  let lastHeader = 0;
  let open = true;
  let node = null;
  const write = (bufs) => {
    try {
      bufs.forEach((b) => {
        fs.writeSync(fd, b);
        samples += b.length / 2;
      });
      if (samples - lastHeader >= HEADER_EVERY) {
        lastHeader = samples;
        fs.writeSync(fd, header(samples, rate), 0, 44, 0);
      }
    } catch (_) {
      /* disk full or file gone: the session's own checks deal with it */
    }
  };
  // The old path: main-thread callback. Only used when the worklet will not load.
  const useScriptProcessor = () => {
    node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (e) => {
      if (open) write([toInt16(e.inputBuffer.getChannelData(0))]);
    };
    src.connect(node);
    node.connect(ctx.destination); // runs only while connected; its output is silent
  };
  const asm = assembler(rate);
  const useWorklet = async () => {
    const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    if (!open) return;
    node = new AudioWorkletNode(ctx, 'shadow-pcm', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: 'explicit',
    });
    node.port.onmessage = guard('pcm.chunk', (e) => {
      if (open) write(asm.push(e.data.frame, e.data.pcm));
    });
    src.connect(node);
    node.connect(ctx.destination); // keeps the graph pulling; its output is silent
  };
  if (ctx.audioWorklet && typeof AudioWorkletNode === 'function') {
    useWorklet().catch((e) => {
      diag(`pcm: AudioWorklet failed, using ScriptProcessor: ${(e && e.message) || e}`);
      if (open && !node) useScriptProcessor();
    });
  } else {
    diag('pcm: AudioWorklet unavailable, using ScriptProcessor');
    useScriptProcessor();
  }
  return {
    rate,
    stats: asm.stats, // holes padded / overlaps trimmed (worklet path); expected to stay 0
    stop() {
      if (!open) return;
      open = false;
      try {
        if (node && node.port) node.port.postMessage('stop');
        src.disconnect();
        if (node) node.disconnect();
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

module.exports = { record, header, RATE, toInt16, assembler, WORKLET_SRC };
