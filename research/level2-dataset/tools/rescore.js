#!/usr/bin/env node
/* rescore.js <results-dir> [--truth f] — re-score saved traces honouring the
 * user's corrections in clip-notes.json, which bench-runner.js does not apply:
 *   truth_override  the sheet's shabad id was wrong; the user named the right one by ear
 *   end_override_s  the sung stretch really ends earlier than the sheet row says
 * Same time-weighted definitions as bench-runner's score().
 */
const fs = require('fs');
const path = require('path');
const { isRight } = require('./bani-aware');
const dir = process.argv[2];
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const DS = require('./gab-data').DS;
const notes = JSON.parse(fs.readFileSync(path.join(DS, 'clip-notes.json')));
const STEP = 0.1;
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/^[a-z]+\d\d\.json$/.test(f)) files.push(p); } })(dir);
const out = [];
for (const f of files.sort()) {
  const t = JSON.parse(fs.readFileSync(f)); if (!t.row || !t.events) continue;
  const clip = path.basename(f, '.json'); const n = notes[clip] || {};
  const ok = new Set([n.truth_override || t.row.shabad_ids[0], ...(n.also_correct || [])]);
  const dur = (n.end_override_s || t.row.end_s) - t.row.start_s;
  const ev = t.events.filter((e) => e.type === 'shabad' || e.type === 'seeking' || e.type === 'verse')
    .map((e) => ({ ...e, t: Math.max(0, e.t) })).sort((a, b) => a.t - b.t);
  let sid = null, seek = false, lastVerse = null, i = 0, right = 0, wrong = 0, searching = 0, firstCorrect = null, longest = 0, cur = 0;
  for (let x = 0; x < dur; x += STEP) {
    while (i < ev.length && ev[i].t <= x) { const e = ev[i += 1, i - 1]; if (e.type === 'shabad') { sid = e.shabadId; if (e.verseId != null) lastVerse = e.verseId; } else if (e.type === 'verse') lastVerse = e.verseId; else seek = e.visible; }
    const shown = seek ? null : sid;
    if (isRight(shown, ok, lastVerse)) { right += STEP; if (firstCorrect == null) firstCorrect = x; cur = 0; }
    else if (shown == null) { searching += STEP; cur = 0; }
    else { wrong += STEP; cur += STEP; longest = Math.max(longest, cur); }
  }
  out.push({ clip, dur: +dur.toFixed(1), corrected: !!(n.truth_override || n.end_override_s),
    found: firstCorrect != null, firstCorrect_s: firstCorrect == null ? null : +firstCorrect.toFixed(1),
    right: +(right / dur).toFixed(4), wrong: +(wrong / dur).toFixed(4), searching: +(searching / dur).toFixed(4), longestWrong_s: +longest.toFixed(1) });
}
const T = out.reduce((a, r) => a + r.dur, 0);
const w = (s) => out.filter((r) => r.found && r.firstCorrect_s <= s).length;
console.log(`${path.basename(dir)}: ${out.length} clips, ${(T / 3600).toFixed(2)} h`);
console.log(`  found <=10s ${w(10)}/${out.length} | <=20s ${w(20)}/${out.length} | <=30s ${w(30)}/${out.length} | never ${out.filter((r) => !r.found).length}`);
console.log(`  right ${(100 * out.reduce((a, r) => a + r.right * r.dur, 0) / T).toFixed(2)}% | wrong ${(100 * out.reduce((a, r) => a + r.wrong * r.dur, 0) / T).toFixed(2)}% | searching ${(100 * out.reduce((a, r) => a + r.searching * r.dur, 0) / T).toFixed(2)}% | longest wrong ${Math.max(...out.map((r) => r.longestWrong_s))}s`);
if (process.argv.includes('--corrected')) out.filter((r) => r.corrected).forEach((r) => console.log(`  [corrected] ${r.clip} found ${r.firstCorrect_s} right ${(100 * r.right).toFixed(1)}% wrong ${(100 * r.wrong).toFixed(1)}%`));
fs.writeFileSync(path.join(dir, 'rescored.json'), JSON.stringify(out, null, 1));
