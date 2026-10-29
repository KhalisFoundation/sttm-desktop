#!/usr/bin/env node
/* renton-stress.js (= vf-lag-stress.js that also keeps verse events and writes renton-score input:
 *   {part, dur, events, summary}; score with renton-score.js on the output dir).
 * vf-lag-stress.js — does recognised text fall behind the microphone?
 *
 * bench-runner and khalis-bench AWAIT every chunk, so the component can never fall behind
 * in them. This harness feeds the real component (headless bench-driver) at WALL-CLOCK pace
 * without awaiting processing, exactly like the worklet does, and measures the audio
 * backlog: seconds of audio delivered minus seconds the recognizer has consumed. A forced
 * slowdown (VF_ORT_THREADS=1 and/or --delay-ms N added to every model pass) reproduces a
 * computer that decodes slower than real time (tonight's Gurdwara PC, ~0.85x).
 *
 *   node tools/vf-lag-stress.js --clip rt11_kirtan1 --from 0 --to 240 [--delay-ms 150]
 *        [--root <worktree>] [--pace wall|fast] [--out file.json]
 *
 * --pace fast awaits every chunk instead (no backlog possible) and reports the chain's
 * wall/CPU per second of audio by phase (searching / following) plus the model share, i.e.
 * what the judge/board/JS cost on top of the engines.
 * --root runs another worktree's component (A/B against base). No shadow preload needed:
 * the shadow config of that worktree is patched here (SHADOW_BUILD off).
 */
const fs = require('fs');
const path = require('path');

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = path.resolve(arg('root', path.resolve(__dirname, '../../..')));
const CLIPS = '/Users/asingh02/personal/live-darbar-venues/clips';
const MODEL = process.env.MODEL || '/Users/asingh02/AAI/models/karansea-shabad-ctc/model.int8.onnx';
const USERDATA = process.env.VF_BANIDB_USER_DATA || path.join(process.env.HOME, 'Library/Application Support/SikhiToTheMax');
const SR = 16000;
const CHUNK = 2048; // 128 ms, like bench-runner
const FROM = Number(arg('from', 0));
const TO = Number(arg('to', 240));
const DELAY = Number(arg('delay-ms', 0));
const PACE = arg('pace', 'wall');
const OUT = arg('out', '');

// Shadow config off for this worktree (what no-shadow-preload.js does, by path).
{
  const cfg = require.resolve(path.join(ROOT, 'www/main/addons/voice-follow/shadow/config.js'));
  const real = require(cfg);
  require.cache[cfg].exports = { ...real, SHADOW_BUILD: false };
}
const { createDriver } = require(path.join(ROOT, 'research/level2-dataset/tools/bench-driver'));
const { Infer } = require(path.join(ROOT, 'www/main/addons/voice-follow/engine/infer'));
const { Recognizer } = require(path.join(ROOT, 'www/main/addons/voice-follow/engine/recognizer'));
const sessionLog = require(path.join(ROOT, 'www/main/addons/voice-follow/engine/session-log'));

function readWav(file) {
  const b = fs.readFileSync(file); let off = 12;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4), sz = b.readUInt32LE(off + 4);
    if (id === 'data') { const n = Math.floor(sz / 2), out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = b.readInt16LE(off + 8 + i * 2) / 32768; return out; }
    off += 8 + sz + (sz & 1);
  }
  throw new Error('no data chunk');
}

// Instrumentation: model passes (timed, optionally slowed), audio consumed, backlog events.
const model = { ms: [], same: 0, lastBuf: null };
const origEmis = Infer.prototype.emissions;
Infer.prototype.emissions = async function emissions(buf) {
  if (model.lastBuf && model.lastBuf.length === buf.length) {
    let eq = true;
    for (let i = 0; i < buf.length; i += 1) if (buf[i] !== model.lastBuf[i]) { eq = false; break; }
    if (eq) model.same += 1;
  }
  model.lastBuf = buf.slice(0);
  const t = performance.now();
  const r = await origEmis.call(this, buf);
  if (DELAY > 0) await new Promise((res) => setTimeout(res, DELAY));
  model.ms.push(performance.now() - t);
  return r;
};
let consumed = 0;
const origPush = Recognizer.prototype.push;
Recognizer.prototype.push = function push(pcm) { consumed += pcm.length; return origPush.call(this, pcm); };
const backlogEvents = [];
const origLog = sessionLog.logEvent;
sessionLog.logEvent = (type, fields) => { if (type === 'audio_backlog') backlogEvents.push({ wall: performance.now(), ...fields }); return origLog(type, fields); };

(async () => {
  const pcm = readWav(path.join(CLIPS, `${arg('clip', 'rt11_kirtan1')}.wav`)).subarray(FROM * SR, TO * SR);
  const events = [];
  const driver = await createDriver({ model: MODEL, userData: USERDATA, onEvent: (ev) => { if (['shabad', 'seeking', 'verse', 'component-error'].includes(ev.type)) events.push({ t: ev.t + FROM, type: ev.type, shabadId: ev.shabadId, verseId: ev.verseId, visible: ev.visible, message: ev.message }); } });
  await driver.start();
  const sampleAt = [];
  const wall0 = performance.now();
  const cpu0 = process.cpuUsage();
  let enqueued = 0;
  if (PACE === 'wall') {
    const timer = setInterval(() => {
      sampleAt.push({ wall: +((performance.now() - wall0) / 1000).toFixed(1), audio: +(enqueued / SR).toFixed(1), lag: +((enqueued - consumed) / SR).toFixed(2), phase: driver.snapshot().phase });
    }, 1000);
    for (let p = 0; p < pcm.length; p += CHUNK) {
      const chunk = pcm.subarray(p, Math.min(p + CHUNK, pcm.length));
      const audioT = (p + chunk.length) / SR;
      const ahead = audioT * 1000 - (performance.now() - wall0);
      // eslint-disable-next-line no-await-in-loop
      if (ahead > 1) await new Promise((r) => setTimeout(r, ahead));
      driver.enqueue(chunk, audioT); // never awaited: the microphone does not wait
      enqueued += chunk.length;
    }
    clearInterval(timer);
    const tDone = performance.now();
    await driver.drain();
    sampleAt.push({ wall: +((performance.now() - wall0) / 1000).toFixed(1), audio: +(enqueued / SR).toFixed(1), lag: 0, drainS: +((performance.now() - tDone) / 1000).toFixed(1), phase: driver.snapshot().phase });
  } else {
    // Awaited: chain wall per audio second by phase; CPU for the whole process.
    const phases = {};
    for (let p = 0; p < pcm.length; p += CHUNK) {
      const chunk = pcm.subarray(p, Math.min(p + CHUNK, pcm.length));
      const audioT = (p + chunk.length) / SR;
      const ph = driver.snapshot().phase;
      const m0 = model.ms.length;
      const t = performance.now();
      // eslint-disable-next-line no-await-in-loop
      await driver.push(chunk, audioT);
      const dt = performance.now() - t;
      const st = phases[ph] || (phases[ph] = { audioS: 0, wallMs: 0, modelMs: 0, windows: 0 });
      st.audioS += chunk.length / SR; st.wallMs += dt;
      for (let i = m0; i < model.ms.length; i += 1) { st.modelMs += model.ms[i]; st.windows += 1; }
      enqueued += chunk.length;
    }
    const cpu = process.cpuUsage(cpu0);
    const wall = performance.now() - wall0;
    console.log(`fast: audio ${(enqueued / SR).toFixed(0)} s, wall ${(wall / 1000).toFixed(0)} s, cpu ${((cpu.user + cpu.system) / 1e6).toFixed(0)} s = ${(((cpu.user + cpu.system) / 1000) / (enqueued / SR)).toFixed(0)} cpu ms / audio s`);
    console.log('| phase | audio s | chain wall ms / audio s | model ms / audio s | windows / audio s | non-model ms / audio s |');
    console.log('|---|---|---|---|---|---|');
    for (const [ph, st] of Object.entries(phases)) console.log(`| ${ph} | ${st.audioS.toFixed(0)} | ${(st.wallMs / st.audioS).toFixed(0)} | ${(st.modelMs / st.audioS).toFixed(0)} | ${(st.windows / st.audioS).toFixed(2)} | ${((st.wallMs - st.modelMs) / st.audioS).toFixed(0)} |`);
  }
  await driver.stop();
  const cpu = process.cpuUsage(cpu0);
  const sorted = [...model.ms].sort((a, b) => a - b);
  const lags = sampleAt.map((s) => s.lag);
  const lagSorted = [...lags].sort((a, b) => a - b);
  const summary = {
    root: ROOT, clip: arg('clip', 'rt11_kirtan1'), from: FROM, to: TO, pace: PACE, delayMs: DELAY, threads: process.env.VF_ORT_THREADS || '4',
    windows: model.ms.length, medianWindowMs: sorted.length ? +sorted[Math.floor(sorted.length / 2)].toFixed(0) : null,
    sameBufferWindows: model.same,
    cpuS: +((cpu.user + cpu.system) / 1e6).toFixed(1),
    lagMax: lags.length ? Math.max(...lags) : null,
    lagP95: lagSorted.length ? lagSorted[Math.floor(lagSorted.length * 0.95)] : null,
    lagLast: sampleAt.length > 1 ? sampleAt[sampleAt.length - 2].lag : null,
    drainS: sampleAt.length ? sampleAt[sampleAt.length - 1].drainS : null,
    backlogEvents: backlogEvents.length,
    shown: events.filter((e) => e.type === 'shabad').map((e) => `${e.shabadId}@${e.t.toFixed(1)}`),
    errors: events.filter((e) => e.type === 'component-error').map((e) => e.message),
  };
  if (PACE === 'wall') {
    console.log('| wall s | audio s | lag s | phase |');
    console.log('|---|---|---|---|');
    for (const s of sampleAt) if (Math.round(s.wall) % 10 === 0 || s.drainS != null) console.log(`| ${s.wall} | ${s.audio} | ${s.lag}${s.drainS != null ? ` (drained in ${s.drainS} s)` : ''} | ${s.phase} |`);
  }
  console.log(JSON.stringify(summary));
  if (OUT) fs.writeFileSync(OUT, JSON.stringify({ part: arg('clip', 'rt11_kirtan1'), dur: TO, summary, samples: sampleAt, backlogEvents, events }));
})().catch((e) => { console.error(e.stack); process.exit(1); });
