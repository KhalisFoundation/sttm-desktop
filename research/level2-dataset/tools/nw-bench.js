#!/usr/bin/env node
/* nw-bench.js — the real VoiceFollow component headless over the Khalsa School Newton session (Asa di Vaar, Oct 11).
 *   --mode session  the whole stitched session from t=0 (autopilot Start at 0), his 5 taps injected at their times
 *                   (vf_pick: 21@84, 1739@165, 174@863, 514@882, 2792@2691) through the tap path (manual lock);
 *   --mode parts    a fresh Start at t=0 of each clip (nw11_asa1, nw11_asa2, nw11_kirtan2..4, ytasa1): cold lock / Bani open.
 *   --root <worktree>  run that worktree's component (base / MVP 9.0 / candidate); default this worktree.
 *   --from/--to (session seconds), --only part,part, --fake (no model: plumbing test), --out <dir>.
 * Output: <out>/<name>.json {name, dur, offset, events[]} — same event shape as renton-bench (+ 'follower' line moves).
 */
const fs = require('fs');
const path = require('path');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = path.resolve(arg('root', path.resolve(__dirname, '../../..')));
process.env.VF_DRIVER_ROOT = ROOT;
{ const cfg = require.resolve(path.join(ROOT, 'www/main/addons/voice-follow/shadow/config.js')); const real = require(cfg); require.cache[cfg].exports = { ...real, SHADOW_BUILD: false }; }
const { createDriver } = require(path.join(__dirname, 'nw-driver'));
const NW = path.join(__dirname, '../newton'); // taps, truth, Bani 90 row maps (committed)
const CLIPS = process.env.VF_CLIPS || '/Users/asingh02/personal/live-darbar-venues/clips';
const SESSION = path.join(CLIPS, 'nw11_session.wav'); // stitched 16 kHz session (2953 s)
const TAPS = JSON.parse(fs.readFileSync(path.join(NW, 'taps.json')));
const MODEL = require('./speech-pack').speechModel().onnx;
const USERDATA = process.env.VF_BANIDB_USER_DATA || path.join(process.env.HOME, 'Library/Application Support/SikhiToTheMax');
const SR = 16000, CHUNK = 2048;
const MODE = arg('mode', 'session');
const FROM = Number(arg('from', 0)), TO = Number(arg('to', 1e9));
const FAKE = process.argv.includes('--fake');
const OUT = arg('out'); fs.mkdirSync(OUT, { recursive: true });
const PARTS = { nw11_asa1: 110, nw11_asa2: 1640, nw11_kirtan2: 830, nw11_kirtan3: 1890, nw11_kirtan4: 2680, 'ytasa1_4IXk2t_Irqo_900-1620': 0 };
const ONLY = arg('only', '') ? new Set(arg('only', '').split(',')) : null;
function readWav(file) {
  const b = fs.readFileSync(file); let off = 12;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4), sz = b.readUInt32LE(off + 4);
    if (id === 'data') { const n = Math.floor(sz / 2), out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = b.readInt16LE(off + 8 + i * 2) / 32768; return out; }
    off += 8 + sz + (sz & 1);
  }
  throw new Error('no data chunk');
}
const KEEP = new Set(['shabad', 'seeking', 'verse', 'length', 'pane', 'component-error', 'paath-follower']);
async function run(name, pcm, offset, taps) {
  const events = []; const t0 = Date.now(); let lastFol = null;
  const engineOverride = FAKE ? { ready: async () => ({}), isReady: () => true, createRecognizer: async () => ({ push: async () => null }), createFollower: async () => ({ push: async () => null }), createPaathFollower: async () => ({ push: async () => null }) } : undefined;
  const driver = await createDriver({ model: FAKE ? null : MODEL, userData: USERDATA, engineOverride, cacheId: name, onEvent: (ev) => {
    if (KEEP.has(ev.type)) events.push({ t: ev.t, type: ev.type, shabadId: ev.shabadId, verseId: ev.verseId, visible: ev.visible, length: ev.length, message: ev.message, baniId: ev.baniId, lines: ev.lines });
    else if (ev.type === 'follower') { const k = `${ev.verseId}/${ev.lineIndex}`; if (k !== lastFol) { lastFol = k; events.push({ t: ev.t, type: 'follower', verseId: ev.verseId, lineIndex: ev.lineIndex, wordIndex: ev.wordIndex, conf: ev.confidence }); } }
  } });
  await driver.start();
  let ti = 0;
  const start = Math.max(0, Math.round((FROM - offset) * SR)), stop = Math.min(pcm.length, Math.round((TO - offset) * SR));
  for (let p = start; p < stop; p += CHUNK) {
    const chunk = pcm.subarray(p, Math.min(p + CHUNK, stop));
    const audioT = (p + chunk.length) / SR;
    while (ti < taps.length && taps[ti].t - offset <= audioT) {
      const tp = taps[ti++];
      events.push({ t: tp.t - offset, type: 'tap', shabadId: tp.shabadId, verseId: tp.verseId });
      await driver.lock({ shabadId: tp.shabadId, verseId: tp.verseId, verse: tp.verse }, { manual: true });
    }
    await driver.push(chunk, audioT);
  }
  await driver.stop();
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ name, root: ROOT, mode: MODE, offset, from: start / SR, dur: stop / SR, wall_s: (Date.now() - t0) / 1000, events }, null, 0));
  const sh = events.filter((e) => e.type === 'shabad' || e.type === 'tap').map((e) => `${e.type === 'tap' ? 'TAP ' : ''}${e.shabadId}@${(offset + e.t).toFixed(1)}`);
  console.log(`${name} | ${((Date.now() - t0) / 1000).toFixed(0)} s wall | verses ${events.filter((e) => e.type === 'verse').length} | errors ${events.filter((e) => e.type === 'component-error').length} | shown ${sh.slice(0, 24).join(' ')}`);
}
(async () => {
  if (MODE === 'session') await run('nw11_session', readWav(SESSION), 0, TAPS.filter((x) => x.t >= FROM && x.t <= TO));
  else for (const [part, offset] of Object.entries(PARTS)) { if (ONLY && !ONLY.has(part)) continue; await run(part, readWav(path.join(CLIPS, `${part}.wav`)), offset, []); }
})().catch((e) => { console.error(e.stack); process.exit(1); });
