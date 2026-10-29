#!/usr/bin/env node
/* akhand-bench.js — GAB replay runner for Akhand / Sehaj Paath (benchmark folder 4-akhand-paath): reading Sri Guru
 * Granth Sahib Ji Ang after Ang. Runs the real VoiceFollow component (headless, full BaniDB, every Bani route ON, as
 * in the app) over each whole clip from t=0. No truth is given to the app. The event trace (VF_EVENT_TRACE, clip
 * seconds) is what GAB scores (gab-score.js -> sangat-score.js against lines.csv / shabads.csv): in-sequence % = the
 * right Shabad on screen, wrong s/h, seconds behind the reader per pangti, lines reached, and every Shabad crossing
 * (a "switch": the next Shabad begins while the screen shows the previous one) with its delay.
 *
 * Clips: rows of the benchmark manifest (VF_BENCHMARK, default ~/personal/vf-benchmark) whose suite_jobs name
 * `apaath:<id>`; audio = <benchmark>/<audio>; cache id = the row id.
 * Usage: node akhand-bench.js [--only <id>,<id>] [--out <dir>] [--fast]   (vf-check / gab call it with --fast)
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createDriver } = require(path.join(__dirname, 'bench-driver'));

const BENCH = process.env.VF_BENCHMARK || path.join(os.homedir(), 'personal/vf-benchmark');
const MODEL = require('./speech-pack').speechModel().onnx;
const USERDATA = process.env.VF_BANIDB_USER_DATA || path.join(os.homedir(), 'Library/Application Support/SikhiToTheMax');
const SR = 16000;
const CHUNK = 2048;
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const ONLY = arg('only', '') ? new Set(arg('only', '').split(',')) : null;
const FAST = process.argv.includes('--fast');
const OUT = arg('out', path.join(require('./gab-data').DS, 'results', `akhand-${Date.now()}`));
fs.mkdirSync(OUT, { recursive: true });

function readWav(file) {
  const b = fs.readFileSync(file);
  let off = 12;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const sz = b.readUInt32LE(off + 4);
    if (id === 'data') { const n = Math.floor(sz / 2); const out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = b.readInt16LE(off + 8 + i * 2) / 32768; return out; }
    off += 8 + sz + (sz & 1);
  }
  throw new Error('no data chunk');
}

// the suite's jobs (vf-suites.js apaath): one per manifest row with suite_jobs apaath:<id>
function akhandRows() {
  const { parseCsv, canonRows } = require('./vf-manifest');
  const rows = canonRows(parseCsv(fs.readFileSync(path.join(BENCH, 'manifest.csv'), 'utf8')));
  return rows.filter((r) => (r.suite_jobs || '').split(';').some((j) => j.startsWith('apaath:')))
    .map((r) => ({ row: r, id: r.id, wav: path.join(BENCH, r.audio || `${r.content_folder}/${r.id}/audio.wav`) }));
}

async function main() {
  const results = [];
  for (const { row, id, wav } of akhandRows()) {
    if (ONLY && !ONLY.has(id)) continue;
    if (!fs.existsSync(wav)) { console.error(`${id}: no audio ${wav}`); continue; }
    const pcm = readWav(wav);
    const events = [];
    const t0 = Date.now();
    const driver = await createDriver({ model: MODEL, userData: USERDATA, cacheId: id, onEvent: (ev) => {
      if (['shabad', 'seeking', 'verse', 'component-error'].includes(ev.type)) events.push({ t: ev.t, type: ev.type, shabadId: ev.shabadId, verseId: ev.verseId, visible: ev.visible, message: ev.message });
    } });
    await driver.start();
    const wall0 = Date.now();
    for (let p = 0; p < pcm.length; p += CHUNK) {
      const chunk = pcm.subarray(p, Math.min(p + CHUNK, pcm.length));
      const audioT = (p + chunk.length) / SR;
      await driver.push(chunk, audioT);
      if (!FAST) { const ahead = audioT * 1000 - (Date.now() - wall0); if (ahead > 2) await new Promise((r) => setTimeout(r, ahead)); }
    }
    await driver.stop();
    const shown = events.filter((e) => e.type === 'shabad').map((e) => `${e.shabadId}@${e.t.toFixed(1)}`);
    const rec = { clip: id, dur: +(pcm.length / SR).toFixed(1), shown, errors: events.filter((e) => e.type === 'component-error').length, wall_s: Math.round((Date.now() - t0) / 1000) };
    results.push(rec);
    fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify({ row: { id, content_folder: row.content_folder }, dur: rec.dur, events }, null, 1));
    console.log(`${id} | ${rec.dur} s | errors ${rec.errors} | shown ${shown.slice(0, 10).join(' ')}${shown.length > 10 ? ` +${shown.length - 10}` : ''}`);
  }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
}
if (require.main === module) main().catch((e) => { console.error(e.stack); process.exit(1); });
module.exports = { akhandRows, BENCH };
