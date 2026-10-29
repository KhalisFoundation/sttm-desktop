#!/usr/bin/env node
/* renton-score.js <dir> [<dir2> ...] — score renton-bench.js runs against tonight's truth.
 *   Paath parts (rehras / aarti / sohila): forced-aligned line truth ($V/data/truth/rt11_<part>.truth.json,
 *   or env REHRAS_TRUTH for a realigned Rehras). Only confident rows with an app verse id are scored.
 *     bani right  screen shows the right Bani (or a member shabad of it)
 *     line exact  shown line == the line being read; within 1 = shown line is the read line or a neighbour
 *     lag         per read line: first time the app shows it (from 5 s before to 60 s after its start) minus its start
 *     behind      seconds the screen sat > 1 line behind the reader; longest such stretch; stretches > 5 s
 *   Kirtan parts: time from the clip start (a fresh Start) to the Shabad first on screen, in S2 session
 *   seconds, vs tonight's tap / first-on-screen; seconds of a wrong Shabad on screen.
 */
const fs = require('fs');
const path = require('path');
const V = process.env.VF || path.join(__dirname, '..', 'renton-oct11');
const DS = process.env.DS || path.join(__dirname, '..');
const mem = JSON.parse(fs.readFileSync(path.join(DS, 'aarti/bani-members.json'))).members;
const K = JSON.parse(fs.readFileSync(path.join(V, 'kirtan-targets.json')));
const STEP = 0.1;
const PAATH = { rt11_rehras: 21, rt11_aarti: 22, rt11_sohila: 23 };
const BANI_OK = { 21: ['bani:21', 'bani:9', 'bani:10', 'bani:1000', ...mem['21']], 22: ['bani:22', ...mem['22'], 51 /* Sohila's Gagan mai thaal = same text as the Aarti piece */], 23: ['bani:23', ...mem['23']] };
const KIRTAN_OK = { rt11_kirtan1: [2053], rt11_fareed1: [5299, 5286], rt11_fareed2: [5238], rt11_hukamnama: [3048], rt11_sohila: [1958, ...BANI_OK[23]] };
const pct = (a, b) => (b ? +(100 * a / b).toFixed(1) : null);
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1); };

function timeline(events) {
  return events.filter((e) => ['shabad', 'seeking', 'verse'].includes(e.type)).sort((a, b) => a.t - b.t);
}
function paath(run, part) {
  const baniId = PAATH[part];
  const tf = part === 'rt11_rehras' && process.env.REHRAS_TRUTH ? process.env.REHRAS_TRUTH : path.join(V, `truth/${part}.truth.json`);
  const L = JSON.parse(fs.readFileSync(tf)).lines.filter((l) => l.confident && l.appVerseId != null && l.start < run.dur - 2).sort((a, b) => a.start - b.start);
  const ok = new Set(BANI_OK[baniId]);
  const idxOf = new Map(); // app verse id -> Bani line indexes
  // Positions of every mapped truth row, confident or not: showing the right line whose truth
  // row is unconfident is not 'off the line' (only confident time is scored).
  for (const l of JSON.parse(fs.readFileSync(tf)).lines.filter((x) => x.appVerseId != null)) { if (!idxOf.has(l.appVerseId)) idxOf.set(l.appVerseId, new Set()); idxOf.get(l.appVerseId).add(l.lineIndex); }
  const ev = timeline(run.events);
  const t0 = L[0].start, t1 = Math.min(L[L.length - 1].end, run.dur);
  let sid = null, seeking = false, verse = null, i = 0, k = -1;
  let T = 0, bani = 0, wrong = 0, none = 0, exact = 0, near = 0, behind = 0, cur = 0, longest = 0;
  const stretches = [];
  let firstBani = null;
  for (let t = 0; t < t1; t += STEP) {
    while (i < ev.length && ev[i].t <= t) { const e = ev[i++]; if (e.type === 'shabad') sid = e.shabadId; if (e.type === 'seeking') seeking = e.visible; if (e.type === 'verse') verse = e.verseId; }
    const shown = seeking ? null : sid;
    if (firstBani == null && ok.has(shown)) firstBani = t;
    if (t < t0) continue;
    while (k + 1 < L.length && L[k + 1].start <= t) k++;
    if (k < 0) continue;
    const line = L[k];
    T += STEP;
    let isBehind = false;
    if (ok.has(shown)) {
      bani += STEP;
      if (verse === line.appVerseId) { exact += STEP; near += STEP; }
      else if (verse != null && idxOf.has(verse)) {
        const d = Math.min(...[...idxOf.get(verse)].map((x) => line.lineIndex - x).map((x) => (Math.abs(x) < 1e9 ? x : 1e9)));
        const dd = [...idxOf.get(verse)].map((x) => line.lineIndex - x);
        const best = dd.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a));
        if (Math.abs(best) <= 1) near += STEP; else if (best > 1) isBehind = true;
        void d;
      } else isBehind = true; // a line the reader is not on (unmapped / far)
    } else if (shown == null) { none += STEP; isBehind = true; } else { wrong += STEP; isBehind = true; }
    if (isBehind) { behind += STEP; cur += STEP; } else { if (cur > 5) stretches.push(+cur.toFixed(1)); longest = Math.max(longest, cur); cur = 0; }
  }
  if (cur > 5) stretches.push(+cur.toFixed(1)); longest = Math.max(longest, cur);
  const vev = ev.filter((e) => e.type === 'verse');
  const lags = [];
  let reached = 0;
  let lastHit = -Infinity; // repeats/refrains: a line's hit must come after the previous line's hit
  for (const l of L) {
    const hit = vev.find((e) => e.verseId === l.appVerseId && e.t >= Math.max(l.start - 5, lastHit) && e.t <= l.start + 60);
    if (hit) { reached++; lags.push(hit.t - l.start); lastHit = hit.t; }
  }
  return { part, scored_s: +T.toFixed(0), firstBani_s: firstBani == null ? null : +firstBani.toFixed(1), baniRight: pct(bani, T), wrong: pct(wrong, T), none: pct(none, T),
    lineExact: pct(exact, T), lineWithin1: pct(near, T), linesReached: `${reached}/${L.length}`, lagMedian: q(lags, 0.5), lagP90: q(lags, 0.9),
    behindPct: pct(behind, T), longestBehind_s: +longest.toFixed(1), stretchesOver5s: stretches.length };
}
function kirtan(run, part) {
  const off = K.clipOffsets[part];
  const ok = new Set(KIRTAN_OK[part]);
  const ev = timeline(run.events);
  const targets = K.targets.filter((x) => (x.clip || '').startsWith(part) || (part === 'rt11_sohila' && [1958, 49].includes(x.shabadId)))
    .filter((x) => x.kind !== 'parmaan' && (x.startedSec == null || x.startedSec >= off - 30));
  const rows = targets.map((x) => {
    const acc = x.shabadId === 49 ? new Set([49, 'bani:23']) : new Set([x.shabadId]);
    const e = ev.find((y) => y.type === 'shabad' && acc.has(y.shabadId));
    const at = e ? +(off + e.t).toFixed(1) : null;
    const tap = x.firstOnScreenSec;
    return { shabad: x.shabadId, kind: x.kind, sungFrom: x.startedSec, tonight: tap, now: at, vsTonight_s: at != null && tap != null ? +(at - tap).toFixed(1) : null };
  });
  let sid = null, seeking = false, i = 0, wrong = 0;
  const wrongIds = new Set();
  for (let t = 0; t < run.dur; t += STEP) {
    while (i < ev.length && ev[i].t <= t) { const e = ev[i++]; if (e.type === 'shabad') sid = e.shabadId; if (e.type === 'seeking') seeking = e.visible; }
    const shown = seeking ? null : sid;
    if (shown != null && !ok.has(shown)) { wrong += STEP; wrongIds.add(shown); }
  }
  return { part, targets: rows, wrong_s: +wrong.toFixed(1), wrongIds: [...wrongIds], shown: ev.filter((e) => e.type === 'shabad').map((e) => `${e.shabadId}@${(off + e.t).toFixed(0)}`).slice(0, 12) };
}
const all = {};
for (const dir of process.argv.slice(2)) {
  const res = { paath: [], kirtan: [] };
  for (const f of fs.readdirSync(dir).filter((x) => /^rt11_.*\.json$/.test(x)).sort()) {
    const run = JSON.parse(fs.readFileSync(path.join(dir, f)));
    if (PAATH[run.part]) res.paath.push(paath(run, run.part)); else res.kirtan.push(kirtan(run, run.part));
    if (run.part === 'rt11_sohila') res.kirtan.push(kirtan(run, run.part));
  }
  all[dir] = res;
  console.log(`\n### ${dir}`);
  console.log('| part | first Bani (s) | Bani right | wrong | none | line exact | within 1 | lines reached | lag median | lag p90 | off the read line (>1 behind, wrong or none) | longest off | stretches >5 s |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of res.paath) console.log(`| ${r.part} | ${r.firstBani_s} | ${r.baniRight}% | ${r.wrong}% | ${r.none}% | ${r.lineExact}% | ${r.lineWithin1}% | ${r.linesReached} | ${r.lagMedian} s | ${r.lagP90} s | ${r.behindPct}% | ${r.longestBehind_s} s | ${r.stretchesOver5s} |`);
  console.log('\n| part | shabad | kind | sung from | tonight on screen | now on screen | vs tonight | wrong s (clip) |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const r of res.kirtan) for (const x of r.targets) console.log(`| ${r.part} | ${x.shabad} | ${x.kind} | ${x.sungFrom ?? '-'} | ${x.tonight ?? '-'} | ${x.now ?? 'never'} | ${x.vsTonight_s ?? '-'} | ${r.wrong_s} ${r.wrongIds.join(',')} |`);
  for (const r of res.kirtan) console.log(`  ${r.part} shown: ${r.shown.join(' ')}`);
}
fs.writeFileSync(path.join(process.argv[2], 'renton-score.json'), JSON.stringify(all, null, 1));
