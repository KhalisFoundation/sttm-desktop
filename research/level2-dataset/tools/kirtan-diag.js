#!/usr/bin/env node
/* kirtan-diag.js — why was a kirtan Shabad found late / a parmaan not followed? For each truth stretch of a
 * jaspal/fremont run (khalis-bench JSON + trace/<id>.events.jsonl), print what the search phase saw between the
 * sevadaar's switch and the app showing the Shabad: how often the truth Shabad was the top full-text candidate,
 * its margin over the runner-up, distinct verses it won on, and what was on screen instead.
 *
 *   node kirtan-diag.js <suite dir> [--only kh17] [--late 10]      (stretches whose find time > --late s)
 */
const fs = require('fs');
const path = require('path');
const { clipEvents } = require('./kirtan-score');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const dir = path.resolve(argv[0]);
const only = arg('only');
const late = Number(arg('late', 10));
for (const f of fs.readdirSync(dir).filter((x) => /^kh\d\d_.*\.json$/.test(x) && (!only || x.startsWith(only)))) {
  const run = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const id = path.basename(f, '.json');
  const tf = path.join(dir, 'trace', `${id}.events.jsonl`);
  const tr = fs.existsSync(tf) ? fs.readFileSync(tf, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : run.events;
  const ce = clipEvents(run);
  console.log(`\n## ${id.slice(0, 4)}  ${ce.segs.join(' ')}`);
  for (const s of ce.segs) {
    const m = /^(\w):(\d+)@(\d+)(?:\(never\)|\+([\d.]+))$/.exec(s);
    if (!m) continue;
    const [, kind, sid, start, d] = m;
    const found = d == null ? null : Number(d);
    if (found != null && found <= late) continue;
    const t0 = Number(start); const t1 = found == null ? t0 + 120 : t0 + found;
    const rets = tr.filter((e) => e.type === 'text-retrieval' && e.t >= t0 && e.t <= t1);
    let top = 0; let n = 0; const verses = new Set(); const margins = []; const others = {};
    for (const e of rets) {
      const c = e.candidates || []; if (!c.length) continue; n++;
      if (String(c[0].shabadId) === sid) { top++; verses.add(c[0].verseId); margins.push(+(c[0].score - (c[1] ? c[1].score : 0)).toFixed(2)); } else others[c[0].shabadId] = (others[c[0].shabadId] || 0) + 1;
    }
    const shown = tr.filter((e) => (e.type === 'shabad' || e.type === 'seeking') && e.t >= t0 - 1 && e.t <= t1).map((e) => (e.type === 'shabad' ? `S${e.shabadId}@${e.t.toFixed(0)}` : `seek${e.visible ? 1 : 0}@${e.t.toFixed(0)}`));
    const sw = tr.filter((e) => e.type === 'switch-comparison' && e.t >= t0 && e.t <= t1);
    const swc = {}; for (const e of sw) { const k = e.gate || e.decision || 'x'; swc[k] = (swc[k] || 0) + 1; }
    const words = tr.filter((e) => e.type === 'transcript' && e.t >= t0 && e.t <= t1).map((e) => e.text).join(' ');
    console.log(`  ${kind}:${sid}@${t0} found ${found ?? 'never'} | text-retrieval decodes ${n}, truth top ${top}, verses ${verses.size}, margins ${margins.slice(0, 12).join(',')} | other tops ${Object.entries(others).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}x${v}`).join(' ')} | screen ${shown.slice(0, 6).join(' ')} | switch gates ${JSON.stringify(swc)} | heard ${(words.length / Math.max(1, (t1 - t0) / 60)).toFixed(0)} chars/min`);
  }
}
