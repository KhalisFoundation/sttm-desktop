#!/usr/bin/env node
/* ear-check.js — re-score the user's 30 Fremont ear-check moments (linecheck-fremont/items.json + answers.json)
 * on a replay: over each moment's window [t0, t0 + seconds], which line does the build show?
 * A moment the user judged "sevadaar" is RIGHT when the sevadaar's verse is on screen >= 50% of the window;
 * a moment judged "app" stays right when the earlier app verse is still shown >= 50%; "instrumental" counts as
 * right when the line on screen does not change during the window.
 *   node ear-check.js <suite dir with kh0*.json (fremont or jaspal)> [--items <linecheck dir>]
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const argv = process.argv.slice(2);
const dir = path.resolve(argv[0]);
const lc = argv.includes('--items') ? argv[argv.indexOf('--items') + 1] : path.join(os.homedir(), 'personal/sttm-desktop/research/level2-dataset/linecheck-fremont');
const items = JSON.parse(fs.readFileSync(path.join(lc, 'items.json'), 'utf8'));
const answers = JSON.parse(fs.readFileSync(path.join(lc, 'answers.json'), 'utf8'));
const runs = {};
for (const f of fs.readdirSync(dir).filter((x) => /^kh\d\d_.*\.json$/.test(x))) runs[f.slice(0, 4)] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).events;
const out = { sevadaar: [0, 0, 0], app: [0, 0, 0], instrumental: [0, 0, 0], other: [0, 0, 0] };
const rows = [];
for (const it of items) {
  const a = answers[it.id] || {};
  const ev = runs[it.recording];
  if (!ev) continue;
  const vs = ev.filter((e) => e.type === 'verse' || e.type === 'shabad').sort((x, y) => x.t - y.t);
  const at = (t) => { let v = null; for (const e of vs) { if (e.t > t) break; v = e.verseId ?? v; } return v; };
  const t0 = a.t0 ?? it.t0; const T = a.seconds ?? it.seconds;
  let sev = 0; let app = 0; let n = 0; const shown = new Set();
  for (let t = t0; t < t0 + T; t += 0.1) { const v = at(t); n++; shown.add(v); if (v === a.sevadaarVerse) sev++; if (v === a.appVerse) app++; }
  const kind = ['sevadaar', 'app', 'instrumental'].includes(a.answer) ? a.answer : 'other';
  const ok = kind === 'sevadaar' ? sev / n >= 0.5 : kind === 'app' ? app / n >= 0.5 : kind === 'instrumental' ? shown.size === 1 : null;
  out[kind][0]++; if (ok) out[kind][1]++; out[kind][2] += (kind === 'sevadaar' ? sev : 0) * 0.1;
  rows.push(`${it.id} ${it.recording} ${kind} sevadaar-line ${(100 * sev / n).toFixed(0)}% app-line ${(100 * app / n).toFixed(0)}% ${ok == null ? '' : ok ? 'RIGHT' : 'wrong'}`);
}
if (argv.includes('--rows')) console.log(rows.join('\n'));
console.log(`sevadaar-right moments now right: ${out.sevadaar[1]}/${out.sevadaar[0]} (${out.sevadaar[2].toFixed(0)} s on the sevadaar line); app-right still right: ${out.app[1]}/${out.app[0]}; instruments-only kept the line: ${out.instrumental[1]}/${out.instrumental[0]}; unsure/other: ${out.other[0]}`);
