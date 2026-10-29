#!/usr/bin/env node
/* vf-throughput-measure.js — cost of each Voice-Follow engine per second of audio.
 *
 * Feeds a clip chunk by chunk (2048 samples @16 kHz, like the bench) into ONE engine at a
 * time and reports CPU ms, wall ms and model (ORT) wall ms per second of audio, plus the
 * number of model windows decoded. Threads default to what the app uses (engine/infer.js:
 * 4 intra-op threads on >= 8 cores, spinning off); --threads / --spin override.
 *
 * Usage: node tools/vf-throughput-measure.js [--threads 4] [--spin 0] [--seconds 120]
 *   [--clip rt11_kirtan1] [--rehras rt11_rehras] [--banis <dir with 2101.json, 9002053.json>]
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '../../..');
const ENGINE = path.join(ROOT, 'www/main/addons/voice-follow/engine');
const ort = require(path.join(ROOT, 'node_modules/onnxruntime-node'));
const { Infer } = require(path.join(ENGINE, 'infer'));
const VOCAB = require(path.join(ENGINE, 'assets/vocab'));
const { Recognizer } = require(path.join(ENGINE, 'recognizer'));
const { Follower } = require(path.join(ENGINE, 'follower'));
const { SP } = require(path.join(ENGINE, 'sentencepiece'));

const CLIPS = process.env.VF_CLIPS || require('path').join(require('os').homedir(), 'personal/live-darbar-venues/clips');
const MODEL = require('./speech-pack').speechModel().onnx;
const SR = 16000;
const CHUNK = 2048;
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const SECONDS = Number(arg('seconds', 120));
const cores = os.cpus().length;
const THREADS = Number(arg('threads', cores >= 8 ? 4 : Math.max(1, Math.min(2, cores))));
const SPIN = arg('spin', '0');
const BANIS = arg('banis', '');

function readWav(file) {
  const b = fs.readFileSync(file); let off = 12;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4), sz = b.readUInt32LE(off + 4);
    if (id === 'data') { const n = Math.floor(sz / 2), out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = b.readInt16LE(off + 8 + i * 2) / 32768; return out; }
    off += 8 + sz + (sz & 1);
  }
  throw new Error('no data chunk');
}
const tokenize = (uni) => (uni || '').replace(/[॥।]|\d+/g, ' ').split(/\s+/).filter(Boolean);
const linesOf = (file) => {
  const d = JSON.parse(fs.readFileSync(file));
  const vs = d.verses || d.lines || d;
  return vs.map((v) => ({ verseId: v.verseId, words: tokenize(v.unicode || v.text || v.verse) }));
};

async function run(name, engine, pcm) {
  const cpu0 = process.cpuUsage();
  const w0 = performance.now();
  engine.infer.perf = { ms: [], since: Date.now() };
  let outs = 0;
  for (let p = 0; p < pcm.length; p += CHUNK) {
    // eslint-disable-next-line no-await-in-loop
    const o = await engine.push(pcm.subarray(p, Math.min(p + CHUNK, pcm.length)));
    if (o) outs += 1;
  }
  const wall = performance.now() - w0;
  const cpu = process.cpuUsage(cpu0);
  const modelMs = engine.infer.perf.ms.reduce((a, b) => a + b, 0);
  const perf = engine.infer.perfStats();
  const audioS = pcm.length / SR;
  return {
    name, audioS: +audioS.toFixed(1), windows: perf.windows, outputs: outs,
    cpuMsPerAudioS: +(((cpu.user + cpu.system) / 1000) / audioS).toFixed(0),
    wallMsPerAudioS: +(wall / audioS).toFixed(0),
    modelMsPerAudioS: modelMs == null ? null : +(modelMs / audioS).toFixed(0),
    medianWindowMs: perf.medianMs,
  };
}

(async () => {
  const sess = await ort.InferenceSession.create(MODEL, {
    intraOpNumThreads: THREADS, interOpNumThreads: 1,
    extra: { session: { 'session.intra_op.allow_spinning': String(SPIN) } },
  });
  const infer = new Infer(sess, VOCAB);
  const sp = SP.load();
  const kirtan = readWav(path.join(CLIPS, `${arg('clip', 'rt11_kirtan1')}.wav`)).subarray(0, SECONDS * SR);
  const rehras = readWav(path.join(CLIPS, `${arg('rehras', 'rt11_rehras')}.wav`)).subarray(0, SECONDS * SR);
  const shabadLines = BANIS ? linesOf(path.join(BANIS, '9002053.json')) : null;
  const rehrasLines = BANIS ? linesOf(path.join(BANIS, '2101.json')) : null;
  console.log(`cores ${cores} (${os.cpus()[0].model}) threads ${THREADS} spin ${SPIN} seconds ${SECONDS}`);
  const rows = [];
  // warm-up pass (first ORT run is slow)
  await infer.emissions(kirtan.subarray(0, SR * 4));
  rows.push(await run('recognizer searching (10 s win, 0.5 s hop)', new Recognizer(infer, { inputSr: SR, windowS: 10, hopS: 0.5 }), kirtan));
  rows.push(await run('recognizer following (4 s win, 0.5 s hop)', new Recognizer(infer, { inputSr: SR, windowS: 4, hopS: 0.5 }), kirtan));
  if (shabadLines) rows.push(await run(`follower Shabad (${shabadLines.length} lines, 4 s win, 0.25 s hop)`, new Follower(infer, sp, shabadLines, { inputSr: SR }), kirtan));
  if (rehrasLines) rows.push(await run(`follower Rehras (${rehrasLines.length} lines, 4 s win, 0.25 s hop)`, new Follower(infer, sp, rehrasLines, { inputSr: SR }), rehras));
  if (rehrasLines) {
    const t = performance.now();
    // eslint-disable-next-line no-new
    new Follower(infer, sp, rehrasLines, { inputSr: SR });
    rows.push({ name: 'createFollower Rehras (one-off, main thread)', wallMsPerAudioS: +(performance.now() - t).toFixed(0) });
  }
  console.log('| component | audio s | windows | cpu ms / audio s | wall ms / audio s | model ms / audio s | median window ms |');
  console.log('|---|---|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.name} | ${r.audioS ?? ''} | ${r.windows ?? ''} | ${r.cpuMsPerAudioS ?? ''} | ${r.wallMsPerAudioS} | ${r.modelMsPerAudioS ?? ''} | ${r.medianWindowMs ?? ''} |`);
  if (arg('out', '')) fs.writeFileSync(arg('out', ''), JSON.stringify({ cores, threads: THREADS, spin: SPIN, rows }, null, 1));
  await sess.release();
})().catch((e) => { console.error(e.stack); process.exit(1); });
