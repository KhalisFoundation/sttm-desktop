#!/usr/bin/env node
/* kirtan-ceiling.js — how much of a kirtan miss is the model (what the recognizer heard) and how much the logic?
 * Per clip of a jaspal/fremont replay: heard chars per minute (recognizer output, whole clip), and over the
 * app's SEARCH decodes (no Shabad locked or the Waheguru slide up): how often the sevadaar's Shabad was the
 * search's top-1 / in its top 4 (the candidates the lock logic sees) / in the text index's top 60 (any logic
 * could see it); then the app's time to find each new Shabad and its Shabad-level right %.
 *   node kirtan-ceiling.js <suite dir>[,<suite dir>] [--every 2]
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { clipEvents } = require('./kirtan-score');

const argv = process.argv.slice(2);
const EVERY = argv.includes('--every') ? Number(argv[argv.indexOf('--every') + 1]) : 2;
const DS = require('./gab-data').DS;
const ROOT = path.resolve(DS, '../..');
const { TextIndex } = require(path.join(ROOT, 'www/main/addons/voice-follow/engine/retrieval/text-index.js'));
const cdir = path.join(os.homedir(), 'personal/live-darbar-venues/cache/corpus');
const corpus = fs.readdirSync(cdir).filter((x) => x.endsWith('.json')).map((x) => path.join(cdir, x)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
const idx = new TextIndex(JSON.parse(fs.readFileSync(corpus, 'utf8')));
const norm = (s) => (s || '').replace(/[\s।॥|0-9੦-੯.,;:!?-]+/g, '');
const L = JSON.parse(fs.readFileSync(path.join(DS, 'hf-jaspal', 'ledger.json'), 'utf8'));
const led = new Map(Object.values(L.datasets).filter((d) => d.clipName).map((d) => [d.clipName, d]));
const rows = [];
for (const dir of argv[0].split(',')) {
  for (const f of fs.readdirSync(dir).filter((x) => /^kh\d\d_.*\.json$/.test(x))) {
    const id = f.replace(/\.json$/, '');
    const run = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const tf = path.join(dir, 'trace', `${id}.events.jsonl`);
    const tr = fs.existsSync(tf) ? fs.readFileSync(tf, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : run.events;
    run.trace = tr;
    const tl = run.row.timeline;
    const truthAt = (t) => { let s = null; for (const x of tl) { if (x.t <= t) s = x.shabadId; else break; } return s; };
    const t0 = tl[0].t;
    const heard = tr.filter((e) => e.type === 'transcript' && e.t >= t0).reduce((a, e) => a + norm(e.text).length, 0);
    let searching = true; let sd = 0; let top1 = 0; let top4 = 0; let top60 = 0; let k = 0;
    for (const e of tr) {
      if (e.type === 'shabad') searching = false;
      if (e.type === 'seeking') searching = !!e.visible;
      if (!searching || e.type !== 'transcript' || e.t < t0 || norm(e.text).length < 8) continue;
      if (k++ % EVERY) continue;
      const ts = truthAt(e.t + 5); if (ts == null) continue;
      const r = []; const seen = new Set();
      for (const c of idx.search(e.text, 200)) { if (!seen.has(c.shabadId)) { seen.add(c.shabadId); r.push(c.shabadId); } if (r.length >= 60) break; }
      const rk = r.indexOf(ts);
      sd++; if (rk === 0) top1++; if (rk >= 0 && rk < 4) top4++; if (rk >= 0) top60++;
    }
    const ce = clipEvents(run);
    const d = led.get(id) || {};
    rows.push({ clip: id.slice(0, 4), split: d.split || '?', min: +((run.row.seconds - t0) / 60).toFixed(1), heard: Math.round(heard / ((run.row.seconds - t0) / 60)),
      searchDecodes: sd * EVERY, top1: sd ? Math.round(100 * top1 / sd) : null, top4: sd ? Math.round(100 * top4 / sd) : null, top60: sd ? Math.round(100 * top60 / sd) : null,
      find: ce.segs.filter((s) => s.startsWith('n:')).map((s) => (/never/.test(s) ? 'never' : s.split('+')[1])).join(', '), right: +(100 * ce.right).toFixed(1), searching: +(100 * ce.searching).toFixed(1) });
  }
}
rows.sort((a, b) => a.clip.localeCompare(b.clip));
console.log('| clip | split | min | heard chars/min | search decodes | sevadaar Shabad top-1 / top-4 / top-60 of the search (%) | time to find each new Shabad (s) | Shabad right % | searching % |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.clip} | ${r.split} | ${r.min} | ${r.heard} | ${r.searchDecodes} | ${r.top1 ?? '-'} / ${r.top4 ?? '-'} / ${r.top60 ?? '-'} | ${r.find} | ${r.right} | ${r.searching} |`);
if (argv.includes('--json')) fs.writeFileSync(argv[argv.indexOf('--json') + 1], JSON.stringify(rows, null, 1));
process.exit(0);
