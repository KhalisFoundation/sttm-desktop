#!/usr/bin/env node
/* hearing-app-replay.js — app-side traces for hearing-score.js on clips with no GAB replay (the akhand tier).
 * Runs the real VoiceFollow component (bench-driver, headless, deterministic) over [0, end] of each hearing-sample
 * clip of the tier, from t=0 (cold start, as the GAB runners do), with the PRODUCTION model (Karanbir int8).
 * Model output goes to a PRIVATE emissions store (default results/hearing/emis, record mode), never to the shared
 * GAB cache (GAB never mixes Mac and x86 windows in one clip; these clips' shared entries are x86).
 * Trace: results/hearing/app-<tier>/<id>.events.jsonl (VF_EVENT_TRACE format, clip seconds).
 *   VF_DRIVER_ROOT=<app worktree> node hearing-app-replay.js [--tier akhand] [--only id,...]
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const DS = require('./gab-data').DS;
const TIER = arg('tier', 'akhand');
const OUT = path.join(DS, 'results/hearing', `app-${TIER}`);
process.env.VF_EMIS_CACHE = process.env.VF_EMIS_CACHE || path.join(DS, 'results/hearing/emis');
process.env.VF_EMIS_MODE = 'record';
process.env.VF_EVENT_TRACE = OUT;
fs.mkdirSync(OUT, { recursive: true });
// as vf-check: shadow config OFF, so a lock reaches the screen (useNewShabad) instead of the shadow bus
if (fs.existsSync(path.join(process.env.VF_DRIVER_ROOT || path.resolve(__dirname, '../../..'), 'www/main/addons/voice-follow/shadow/config.js'))) require('./no-shadow-preload');
const { createDriver } = require(path.join(__dirname, 'bench-driver'));
const MODEL = require('./speech-pack').speechModel().onnx;
const USERDATA = process.env.VF_BANIDB_USER_DATA || path.join(os.homedir(), 'Library/Application Support/SikhiToTheMax');
const SR = 16000;
const CHUNK = 2048; // as bench-runner / khalis-bench / akhand-bench
const ONLY = arg('only', '') ? new Set(arg('only', '').split(',')) : null;

function readWav(file) {
  const b = fs.readFileSync(file);
  let off = 12;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const sz = b.readUInt32LE(off + 4);
    if (id === 'data') { const n = Math.floor(sz / 2); const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = b.readInt16LE(off + 8 + i * 2) / 32768; return o; }
    off += 8 + sz + (sz & 1);
  }
  throw new Error('no data chunk');
}

(async () => {
  const clips = JSON.parse(fs.readFileSync(path.join(__dirname, 'hearing-sample.json'), 'utf8')).clips.filter((c) => c.tier === TIER);
  for (const c of clips) {
    if (ONLY && !ONLY.has(c.id)) continue;
    const tf = path.join(OUT, `${c.id}.events.jsonl`);
    if (fs.existsSync(tf) && !ONLY) { console.log(`${c.id}: have trace`); continue; }
    if (fs.existsSync(tf)) fs.unlinkSync(tf);
    const pcm = readWav(c.wav).subarray(0, Math.round(c.end * SR));
    const shown = [];
    const t0 = Date.now();
    const driver = await createDriver({ model: MODEL, userData: USERDATA, cacheId: `hearing-${c.id}`, onEvent: (ev) => { if (ev.type === 'shabad') shown.push(`${ev.shabadId}@${ev.t.toFixed(1)}`); } });
    await driver.start();
    for (let p = 0; p < pcm.length; p += CHUNK) {
      const chunk = pcm.subarray(p, Math.min(p + CHUNK, pcm.length));
      await driver.push(chunk, (p + chunk.length) / SR);
    }
    await driver.stop();
    // the driver names the trace by cacheId
    const raw = path.join(OUT, `hearing-${c.id}.events.jsonl`);
    if (fs.existsSync(raw)) fs.renameSync(raw, tf);
    console.log(`${c.id}: ${(pcm.length / SR).toFixed(0)} s in ${Math.round((Date.now() - t0) / 1000)} s; shown ${shown.slice(0, 8).join(' ')}`);
  }
  process.exit(0);
})().catch((e) => { console.error(e.stack); process.exit(1); });
