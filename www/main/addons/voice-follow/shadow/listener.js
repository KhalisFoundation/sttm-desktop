// The ear that runs while no shadow session is recording, so kirtan in an unattended hall
// (STTM open, nobody at the laptop) is still collected. It only measures loudness, nothing
// is recognised or saved here: when the room has been loud for most of the last stretch,
// it asks the collector to start a session. It keeps the last PRE_ROLL_S seconds of audio in
// memory (16 kHz, 16-bit), so that session begins with the kirtan that triggered it rather
// than half a minute in. Everything stays in memory and is dropped when it stops.
const {
  SHADOW_SOUND_LEVEL,
  SHADOW_SOUND_WINDOW_MS,
  SHADOW_SOUND_SHARE,
  SHADOW_PRE_ROLL_S,
} = require('./config');

const RATE = 16000;
const TICK_MS = 500; // one loudness reading per half second

let st = null; // { stream, ctx, node, src, ring, ringPos, ringFull, ticks, timer, onSound }

function stop() {
  if (!st) return;
  const s = st;
  st = null;
  clearInterval(s.timer);
  try {
    s.src.disconnect();
    s.node.disconnect();
  } catch (_) {
    /* already gone */
  }
  try {
    s.stream.getTracks().forEach((t) => t.stop());
  } catch (_) {
    /* already gone */
  }
  s.ctx.close().catch(() => {});
}

// The last pre-roll seconds as 16-bit PCM, oldest first. Stops the ear.
function takePreRoll() {
  if (!st) return null;
  const { ring, ringPos, ringFull } = st;
  const out = ringFull
    ? Int16Array.from([...ring.subarray(ringPos), ...ring.subarray(0, ringPos)])
    : ring.slice(0, ringPos);
  stop();
  return out.length ? { pcm: out, rate: RATE, seconds: out.length / RATE } : null;
}

async function start(onSound) {
  if (st) return;
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false },
  });
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const src = ctx.createMediaStreamSource(stream);
  // ScriptProcessor is enough for a loudness meter plus a ring buffer.
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const ring = new Int16Array(Math.round(SHADOW_PRE_ROLL_S * RATE));
  const s = {
    stream,
    ctx,
    src,
    node,
    ring,
    ringPos: 0,
    ringFull: false,
    acc: 0, // resampling phase
    sumSq: 0,
    n: 0,
    ticks: [], // [ms, loud?]
    timer: null,
    onSound,
  };
  const step = ctx.sampleRate / RATE;
  node.onaudioprocess = (e) => {
    const x = e.inputBuffer.getChannelData(0);
    for (let i = 0; i < x.length; i += 1) {
      s.sumSq += x[i] * x[i];
      s.n += 1;
    }
    // Downsample by picking every step-th sample (speech band only; this is pre-roll audio).
    for (s.acc; s.acc < x.length; s.acc += step) {
      const v = Math.max(-1, Math.min(1, x[Math.floor(s.acc)]));
      s.ring[s.ringPos] = v < 0 ? v * 32768 : v * 32767;
      s.ringPos += 1;
      if (s.ringPos >= s.ring.length) {
        s.ringPos = 0;
        s.ringFull = true;
      }
    }
    s.acc -= x.length;
  };
  src.connect(node);
  node.connect(ctx.destination); // a ScriptProcessor only runs while connected; output is silent
  s.timer = setInterval(() => {
    const rms = s.n ? Math.sqrt(s.sumSq / s.n) : 0;
    s.sumSq = 0;
    s.n = 0;
    const now = Date.now();
    s.ticks.push([now, rms >= SHADOW_SOUND_LEVEL]);
    s.ticks = s.ticks.filter(([t]) => now - t <= SHADOW_SOUND_WINDOW_MS);
    const span = now - s.ticks[0][0];
    const loud = s.ticks.filter(([, l]) => l).length;
    if (
      span >= SHADOW_SOUND_WINDOW_MS - TICK_MS * 2 &&
      loud >= s.ticks.length * SHADOW_SOUND_SHARE
    ) {
      s.ticks = [];
      if (s.onSound) s.onSound();
    }
  }, TICK_MS);
  st = s;
}

const running = () => !!st;

// The pre-roll as a WAV file (mono 16-bit), for the session folder.
function wavBytes({ pcm, rate }) {
  const b = Buffer.alloc(44 + pcm.length * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + pcm.length * 2, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(pcm.length * 2, 40);
  Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).copy(b, 44);
  return b;
}

module.exports = { start, stop, takePreRoll, running, wavBytes };
