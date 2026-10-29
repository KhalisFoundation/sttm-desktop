// farm-universe.js — pre-record every model window a decision-logic variant of Voice Autopilot can ask for on one
// clip, so a replay of any such variant never leaves the cache (GAB farm, x86 VM only; never mixed with a Mac cache).
//
// Input: the exact audio stream the runner fed the app (tap-preload.js: <tap>/<clip>.f32 + .json with chunk lengths
// and start/lock marks). The engines (engine/recognizer.js, follower.js, follower2.js at 3fafc0ba, fast tier = the
// replay's tier) keep a buffer that starts EMPTY when the engine is created and decode when
//   acc >= hop  and  buf >= 1 s   (acc reset to 0 on each decode)
// with hop 0.5 s (recognizer) / 0.25 s (both followers), window 4 s (followers, following recognizer) or 10 s
// (searching recognizer). With 2048-sample chunks a window is therefore fixed by (creation chunk, decode chunk);
// creations happen at an engine decode: every 2 chunks from the session start or a manual lock (recognizer decodes on
// a 4-chunk grid, followers every 2 chunks). The universe, at every even chunk of the session's phase:
//   A  4 s windows (any follower / following recognizer, steady state)
//   B  4 s-class warm-up windows (1.0-3.84 s, 12 lengths) of an engine created at any even chunk
//   C  10 s windows on the 4-chunk grid (C2: every even chunk) + the session-start searching recognizer's warm-up
//   D  10 s-class warm-ups (4.1-9.7 s, 12 lengths) of a searching recognizer re-created at any even chunk (a release)
// The follower logic itself is never changed (no grid patch).
//
// node farm-universe.js --clip <id> --tap <dir> --cache <root> --app <app root> --model <model.int8.onnx>
//      [--classes A,B,C] [--plan | --check | --record] [--status <dir>]
//   --plan   count windows (and audio seconds of model input) per class, no hashing
//   --check  hash the universe and report how many of the entry's recorded windows it contains (must be all)
//   --record run the model (VF_ORT_THREADS threads) on every universe window the entry lacks; resumable
const fs = require('fs');
const path = require('path');
const os = require('os');

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const flag = (n) => process.argv.includes(`--${n}`);
const CLIP = arg('clip');
const TAP = arg('tap');
const CACHE = arg('cache');
const APP = arg('app');
const MODEL = arg('model');
const CLASSES = (arg('classes', 'A,B,C')).split(',');
const STATUS = arg('status');
const TOOLS = arg('tools', path.join(APP || '', 'research/level2-dataset/tools'));
const SR = 16000;
const W4 = Math.floor(4.0 * SR);
const W10 = Math.floor(10 * SR);
const HOP_REC = Math.floor(0.5 * SR);
const HOP_FOL = Math.floor(0.25 * SR);

const { Store, storeDir, windowKey } = require(path.join(TOOLS, 'emis-cache'));

function readWav(file) { // exactly the runners' readWav (int16 / 32768)
  const b = fs.readFileSync(file); let off = 12;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4), sz = b.readUInt32LE(off + 4);
    if (id === 'data') { const n = Math.floor(sz / 2), out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = b.readInt16LE(off + 8 + i * 2) / 32768; return out; }
    off += 8 + sz + (sz & 1);
  }
  throw new Error('no data chunk');
}

// --wav <file>: the stream the simple runners feed (bench-runner, khalis-bench, renton-bench, akhand-bench): the
// whole wav from sample 0 in 2048-sample chunks, one start at chunk 0.
function loadWav(file) {
  const pcm = readWav(file);
  const chunkLens = [];
  for (let p = 0; p < pcm.length; p += 2048) chunkLens.push(Math.min(2048, pcm.length - p));
  const pos = [0];
  for (const n of chunkLens) pos.push(pos[pos.length - 1] + n);
  return { meta: { id: CLIP, sr: SR, samples: pcm.length, chunkLens, marks: [{ kind: 'start', chunk: 0 }] }, pcm, pos };
}

function loadTap() {
  if (arg('wav')) return loadWav(arg('wav'));
  const meta = JSON.parse(fs.readFileSync(path.join(TAP, `${CLIP}.json`), 'utf8'));
  const b = fs.readFileSync(path.join(TAP, `${CLIP}.f32`));
  const pcm = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  if (pcm.length !== meta.samples) throw new Error(`${CLIP}: tap length ${pcm.length} != ${meta.samples}`);
  if (meta.sr !== SR) throw new Error(`${CLIP}: tap sample rate ${meta.sr} (engines resample; not supported)`);
  const pos = [0];
  for (const n of meta.chunkLens) pos.push(pos[pos.length - 1] + n);
  return { meta, pcm, pos };
}

// Sessions: a start* mark to the next start*/stop (or the end). Origins: the start and every manual lock in it.
function sessions(meta) {
  const n = meta.chunkLens.length;
  const marks = [...meta.marks].sort((a, b) => a.chunk - b.chunk);
  const out = [];
  for (let i = 0; i < marks.length; i++) {
    if (!/^start/.test(marks[i].kind)) continue;
    let end = n;
    for (let j = i + 1; j < marks.length; j++) if (/^start|stop/.test(marks[j].kind) && marks[j].chunk > marks[i].chunk) { end = marks[j].chunk; break; }
    const origins = [marks[i].chunk, ...marks.filter((m) => /^lock/.test(m.kind) && m.chunk >= marks[i].chunk && m.chunk < end).map((m) => m.chunk)];
    out.push({ s0: marks[i].chunk, s1: end, origins });
  }
  if (!out.length) out.push({ s0: 0, s1: n, origins: [0] });
  return out;
}

// Decodes of one engine created after chunk c0 (buffer empty), until its buffer is full (warm-up) or `limit` chunks.
function warmup(pos, c0, s1, W, hop, onWin) {
  let acc = 0;
  for (let e = c0 + 1; e <= s1; e++) {
    acc += pos[e] - pos[e - 1];
    const buf = Math.min(W, pos[e] - pos[c0]);
    if (acc < hop || buf < SR) continue;
    acc = 0;
    if (buf >= W) return;
    onWin(e, buf);
  }
}

// Every window of the requested classes, in priority order (class, then time). Each = {cls, e, L}.
function universe(pos, sess, classes) {
  const wins = [];
  const seen = new Set();
  const add = (cls, e, L) => { const k = `${e}:${L}`; if (seen.has(k)) return; seen.add(k); wins.push({ cls, e, L }); };
  for (const { s0, s1, origins } of sess) {
    const ph2 = new Set(origins.map((o) => o % 2));
    // creation points: a recognizer decode (4-chunk grid) or a follower decode (2-chunk grid: a follower created
    // on the 4-grid decodes every 2 chunks, and a Bani route / release can create engines there; seen on
    // rt11_sohila, follower created at chunk 206 = 2 mod 4). So every 2-chunk grid point of the session's phases.
    const grid2 = [];
    for (let c = s0; c < s1; c++) if (ph2.has(c % 2)) grid2.push(c);
    if (classes.includes('A')) for (let e = s0 + 1; e <= s1; e++) if (ph2.has(e % 2) && pos[e] - pos[s0] >= W4) add('A', e, W4);
    if (classes.includes('B')) for (const c0 of grid2) {
      warmup(pos, c0, s1, W4, HOP_FOL, (e, L) => add('B', e, L));
      warmup(pos, c0, s1, W4, HOP_REC, (e, L) => add('B', e, L));
    }
    if (classes.includes('C2')) for (let e = s0 + 1; e <= s1; e++) if (ph2.has(e % 2) && pos[e] - pos[s0] >= W10) add('C', e, W10);
    if (classes.includes('C')) {
      // 10 s searching windows on the 4-chunk grid of the session's origins: the searching recognizer is created at
      // a session start / release / manual lock, and a release lands on a recognizer decode (4-grid). Checked on
      // the Mac cache (189 clips x 2 builds): every 160000-sample window is on this grid. (C2 = every even chunk.)
      const ph4 = new Set(origins.map((o) => o % 4));
      for (let e = s0 + 1; e <= s1; e++) if (ph4.has(e % 4) && pos[e] - pos[s0] >= W10) add('C', e, W10);
      for (const o of origins) warmup(pos, o, s1, W10, HOP_REC, (e, L) => add('C', e, L)); // session-start searcher
    }
    if (classes.includes('D')) for (const c0 of grid2) warmup(pos, c0, s1, W10, HOP_REC, (e, L) => { if (L >= W4) add('D', e, L); });
  }
  return wins;
}

function storeFor(write) {
  const dir = storeDir({ root: CACHE, model: MODEL, codec: 'q16', clip: CLIP });
  if (write) {
    const prov = path.join(dir, 'provenance.json');
    if (fs.existsSync(prov)) {
      const p = JSON.parse(fs.readFileSync(prov, 'utf8')).platform;
      if (p !== `${process.platform}-${process.arch}`) throw new Error(`${CLIP}: entry is ${p}; never mix platforms`);
    } else if (fs.existsSync(path.join(dir, 'index.jsonl'))) throw new Error(`${CLIP}: entry has no provenance stamp (Mac entry?); refusing`);
  }
  return { dir, store: new Store(dir, { write, codec: 'q16' }) };
}

function stamp(dir) {
  const f = path.join(dir, 'provenance.json');
  if (fs.existsSync(f)) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(f, `${JSON.stringify({ platform: `${process.platform}-${process.arch}`, cpu: (os.cpus()[0] || {}).model || null, host: process.env.VF_RECORD_HOST || os.hostname(), firstRecordedAt: new Date().toISOString(), by: 'gcp-farm farm-universe.js' }, null, 1)}\n`);
}

(async () => {
  const { meta, pcm, pos } = loadTap();
  const sess = sessions(meta);
  const wins = universe(pos, sess, CLASSES);
  const byCls = {};
  for (const w of wins) { const c = (byCls[w.cls] ||= { n: 0, inputS: 0 }); c.n += 1; c.inputS += w.L / SR; }
  const audioS = pcm.length / SR;
  if (flag('plan')) {
    console.log(JSON.stringify({ clip: CLIP, audioS: +audioS.toFixed(1), sessions: sess.length, classes: Object.fromEntries(Object.entries(byCls).map(([k, v]) => [k, { n: v.n, inputS: Math.round(v.inputS) }])) }));
    return;
  }
  const slice = (w) => pcm.subarray(pos[w.e] - w.L, pos[w.e]);
  if (arg('key')) { // where is this window in the stream? (diagnosing a miss)
    const [, Ls] = arg('key').split(':'); const L = Number(Ls);
    for (let e = 1; e < pos.length; e++) if (pos[e] >= L && windowKey(pcm.subarray(pos[e] - L, pos[e])) === arg('key')) {
      const sess0 = sess.find((x) => e > x.s0 && e <= x.s1) || sess[0];
      console.log(JSON.stringify({ clip: CLIP, e, L, tS: +(pos[e] / SR).toFixed(2), lenChunks: L / 2048, eMinusS0Mod4: (e - sess0.s0) % 4, creationChunk: L < W10 && L !== W4 ? e - L / 2048 : null, inUniverse: wins.some((w) => w.e === e && w.L === L) }));
      return;
    }
    console.log(JSON.stringify({ clip: CLIP, key: arg('key'), found: false }));
    return;
  }
  if (flag('check')) {
    const { store } = storeFor(false);
    const keys = new Set(wins.map((w) => windowKey(slice(w))));
    let inU = 0;
    const out = [];
    for (const k of store.index.keys()) if (keys.has(k)) inU += 1; else out.push(k);
    if (flag('locate') && out.length) { // brute force: where are the windows the universe lacks?
      const want = new Map(out.map((k) => [k, Number(k.split(':')[1])]));
      const found = [];
      for (const [k, L] of want) for (let e = 1; e < pos.length; e++) if (pos[e] >= L && windowKey(pcm.subarray(pos[e] - L, pos[e])) === k) { found.push({ e, L, c0: L < W10 ? e - L / 2048 : null, eMod4: e % 4 }); break; }
      console.log(JSON.stringify(found));
    }
    console.log(JSON.stringify({ clip: CLIP, recorded: store.index.size, inUniverse: inU, notInUniverse: out.length, universe: keys.size, sampleMissing: out.slice(0, 5), missingLens: [...new Set(out.map((k) => k.split(":")[1]))] }));
    process.exitCode = out.length ? 4 : 0;
    return;
  }
  if (!flag('record')) throw new Error('one of --plan, --check, --record');
  const ort = require(path.join(APP, 'node_modules/onnxruntime-node'));
  const { Infer } = require(path.join(APP, 'www/main/addons/voice-follow/engine/infer'));
  const VOCAB = require(path.join(APP, 'www/main/addons/voice-follow/engine/assets/vocab'));
  const threads = parseInt(process.env.VF_ORT_THREADS || '2', 10);
  // exactly bench-driver.js realInfer(): the options the replay's recorded windows were made with
  const ortSess = await ort.InferenceSession.create(MODEL, { intraOpNumThreads: threads, interOpNumThreads: 1 });
  const real = new Infer(ortSess, VOCAB);
  real.memo = null;
  const { dir, store } = storeFor(true);
  stamp(dir);
  const t0 = Date.now();
  let done = 0;
  let skipped = 0;
  let lastLog = 0;
  const statusFile = STATUS && path.join(STATUS, `${CLIP}.json`);
  const writeStatus = (state) => {
    if (!statusFile) return;
    fs.mkdirSync(STATUS, { recursive: true });
    fs.writeFileSync(statusFile, JSON.stringify({ clip: CLIP, state, classes: CLASSES, universe: wins.length, recorded: done, already: skipped, audioS: +audioS.toFixed(1), wallS: Math.round((Date.now() - t0) / 1000), at: new Date().toISOString() }));
  };
  for (const w of wins) {
    const buf = slice(w);
    const key = windowKey(buf);
    if (store.has(key)) { skipped += 1; continue; }
    const out = await real.emissions(buf.slice(0));
    store.put(key, out);
    done += 1;
    if (Date.now() - lastLog > 30000) { lastLog = Date.now(); writeStatus('running'); }
  }
  store.close();
  await ortSess.release();
  writeStatus('done');
  console.log(`${CLIP}: universe ${wins.length} windows (${Object.entries(byCls).map(([k, v]) => `${k} ${v.n}`).join(', ')}), recorded ${done}, already ${skipped}, ${Math.round((Date.now() - t0) / 1000)} s`);
})().catch((e) => { console.error(`${CLIP}: ${e.stack || e}`); process.exit(1); });
