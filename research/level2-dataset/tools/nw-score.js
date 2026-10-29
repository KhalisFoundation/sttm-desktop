#!/usr/bin/env node
/* nw-score.js <runDir> [...]  (runs from nw-bench.js; the real screen: node nw-human-run.js ../newton/human.jsonl <dir>/nw11_session.json) — score nw-bench runs (and the real screen, runs/human) against the Newton Asa di Vaar truth.
 * Vaar stretches (truth/nw11_asa1.truth.json, nw11_asa2): confident lines with an app verse id, session seconds.
 *   bani right = screen shows bani:90 or one of its member Shabads; line exact / within 1 (by Bani row);
 *   lag = first time the line is on screen (from 5 s before its start to 60 s after, after the previous hit) minus its start;
 *   premature = the screen left line k (to a line other than k) more than 1 s before k's words ended while k+1 had not started;
 *   behind = seconds the screen sat > 1 line behind; stuck = longest stretch with no screen move while the singer advanced >= 2 lines.
 * Taps: was the Shabad on screen BEFORE his tap (engine found it) and how long after his tap it came up. Session Shabads: replay
 * first-on-screen vs the real screen's first-on-screen.
 */
const fs = require('fs');
const path = require('path');
const NW = path.join(__dirname, '../newton'); // committed truth + row maps (Newton Oct 11 + YouTube Asa di Vaar)
const STEP = 0.1;
const rows90 = JSON.parse(fs.readFileSync(path.join(NW, 'app-bani90-sgpc.json')));
const OK = new Set(['bani:90', ...rows90.map((r) => r.shabadId)]);
const rowOf = new Map(rows90.map((r, i) => [r.verseId, i]));
const TRUTH = { nw11_asa1: 'nw11_asa1', nw11_asa2: 'nw11_asa2', ytasa1: 'ytasa1' };
// Which truth stretches a run is scored on: the session replay -> both Newton stretches; a part -> its own.
const truthsFor = (name) => (name === 'nw11_session' || name === 'nw11_human' ? ['nw11_asa1', 'nw11_asa2'] : name.startsWith('ytasa1') ? ['ytasa1'] : TRUTH[name] ? [name] : []);
const TAPS = JSON.parse(fs.readFileSync(path.join(NW, 'taps.json')));
// Real screen: first time each Shabad came up (human.jsonl), with how it came up.
const REAL = [[1738, 117.4, 'hand'], [1739, 165.4, 'tap'], [1660, 224.9, 'engine'], ['bani:90', 225.5, 'engine'], [1005, 835.3, 'engine'], [174, 863.0, 'tap'], [514, 882.2, 'tap'], [1660, 1655.8, 'engine'], [1752, 1763.2, 'override'], ['bani:90', 1771.4, 'engine'], [816, 1896.6, 'engine'], [513, 1957.0, 'engine'], [2792, 2691.4, 'tap']];
const pct = (a, b) => (b ? +(100 * a / b).toFixed(1) : null);
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2); };
const MINCHK = Number(process.env.MINCHK || 0); // Newton audio is poor for the model (11% of lines pass check>=0.6) but the alignment timing is validated by the base app screen: score all lines by default
const loadTruth = (part) => JSON.parse(fs.readFileSync(path.join(NW, `truth/${part}.truth.json`))).lines.filter((l) => l.check >= MINCHK && l.appVerseId != null && !l.header).sort((a, b) => a.start - b.start);
function timeline(run) { const o = run.offset || 0; return run.events.filter((e) => ['shabad', 'seeking', 'verse', 'tap'].includes(e.type)).map((e) => ({ ...e, t: e.t + o })).sort((a, b) => a.t - b.t); }
function vaar(run, part) {
  const L = loadTruth(part); const ev = timeline(run);
  const span0 = Math.max(L[0].start, run.from + (run.offset || 0)), span1 = Math.min(L[L.length - 1].end, run.dur + (run.offset || 0));
  if (span1 - span0 < 10) return null;
  let sid = null, seeking = false, verse = null, i = 0, k = -1;
  let T = 0, bani = 0, wrong = 0, none = 0, exact = 0, near = 0, behind = 0, cur = 0, longest = 0; const wrongIds = new Map();
  let lastMove = span0, stuckMax = 0, stuckAt = null, lastMoveLine = -1;
  for (let t = span0; t < span1; t += STEP) {
    while (i < ev.length && ev[i].t <= t) { const e = ev[i++]; if (e.type === 'shabad') sid = e.shabadId; if (e.type === 'seeking') seeking = e.visible; if (e.type === 'verse' && e.verseId !== verse) { verse = e.verseId; lastMove = e.t; lastMoveLine = k; } }
    const shown = seeking ? null : sid;
    while (k + 1 < L.length && L[k + 1].start <= t) k++;
    if (k < 0) continue;
    const line = L[k]; T += STEP; let isBehind = false;
    if (OK.has(shown)) {
      bani += STEP;
      if (verse === line.appVerseId) { exact += STEP; near += STEP; }
      else if (verse != null && rowOf.has(verse)) { const d = line.lineIndex - rowOf.get(verse); if (Math.abs(d) <= 1) near += STEP; else if (d > 1) isBehind = true; }
      else isBehind = true;
    } else if (shown == null) { none += STEP; isBehind = true; } else { wrong += STEP; isBehind = true; wrongIds.set(shown, (wrongIds.get(shown) || 0) + STEP); }
    if (isBehind) { behind += STEP; cur += STEP; } else { longest = Math.max(longest, cur); cur = 0; }
    if (OK.has(shown) && k - lastMoveLine >= 2 && t - lastMove > stuckMax) { stuckMax = t - lastMove; stuckAt = +lastMove.toFixed(1); }
  }
  longest = Math.max(longest, cur);
  const vev = ev.filter((e) => e.type === 'verse');
  const lags = []; let reached = 0, lastHit = -Infinity; const hits = new Map();
  for (const l of L) {
    const hit = vev.find((e) => e.verseId === l.appVerseId && e.t >= Math.max(l.start - 5, lastHit) && e.t <= l.start + 60);
    if (hit) { reached++; lags.push(hit.t - l.start); lastHit = hit.t; hits.set(l, hit); }
  }
  // Premature: after line k came up, the first verse change to a line that is not k, before k's words ended (1 s slack) and before k+1 began.
  const premature = [];
  L.forEach((l, j) => {
    const hit = hits.get(l); if (!hit) return;
    const next = L[j + 1]; const limit = Math.min(l.end - 1, next ? next.start : Infinity);
    const away = vev.find((e) => e.t > hit.t && e.t < limit && e.verseId !== l.appVerseId);
    if (away) premature.push({ line: l.lineIndex, at: +away.t.toFixed(1), early_s: +(l.end - away.t).toFixed(1), toRow: rowOf.get(away.verseId) ?? null, to: away.verseId, secondHalfFirst: l.secondHalfFirst });
  });
  const shf = L.filter((l) => l.secondHalfFirst);
  return { part, scored_s: +T.toFixed(0), lines: L.length, baniRight: pct(bani, T), wrong: pct(wrong, T), none: pct(none, T), wrongIds: [...wrongIds].map(([a, b]) => `${a}:${b.toFixed(0)}s`).join(' '),
    lineExact: pct(exact, T), lineWithin1: pct(near, T), linesReached: `${reached}/${L.length}`, lagMedian: q(lags, 0.5), lagP90: q(lags, 0.9),
    behindPct: pct(behind, T), longestBehind_s: +longest.toFixed(1), stuck_s: +stuckMax.toFixed(1), stuckAt,
    premature: premature.length, prematureOfSHF: premature.filter((p) => p.secondHalfFirst).length, shfLines: shf.length, prematureList: premature.slice(0, 12) };
}
function taps(run) {
  const ev = timeline(run); const o = run.offset || 0;
  return TAPS.filter((tp) => tp.t >= run.from + o && tp.t <= run.dur + o).map((tp) => {
    const before = ev.find((e) => e.type === "shabad" && e.shabadId === tp.shabadId && e.t < tp.t - 0.5 && e.t > tp.t - 300);
    const after = ev.find((e) => e.type === 'shabad' && e.shabadId === tp.shabadId && e.t >= tp.t - 0.1);
    return { tap: tp.shabadId, at: tp.t, engineBefore_s: before ? +(tp.t - before.t).toFixed(1) : null, afterTap_s: after ? +(after.t - tp.t).toFixed(1) : null };
  });
}
function shabads(run) {
  const ev = timeline(run); const o = run.offset || 0;
  return REAL.filter(([, t]) => t >= run.from + o - 60 && t <= run.dur + o).map(([id, real, how], j) => {
    const prev = j > 0 ? REAL[j - 1][1] : 0;
    const e = ev.find((x) => x.type === 'shabad' && x.shabadId === id && x.t >= Math.max(prev, real - 120, run.from + o));
    return { shabad: id, real, how, replay: e ? +e.t.toFixed(1) : null, vsReal_s: e ? +(e.t - real).toFixed(1) : null };
  });
}
const all = {};
for (const dir of process.argv.slice(2)) {
  const res = { vaar: [], taps: [], shabads: [] };
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && x !== 'score.json').sort()) {
    const run = JSON.parse(fs.readFileSync(path.join(dir, f)));
    for (const part of truthsFor(run.name)) { const r = vaar(run, part); if (r) res.vaar.push({ run: run.name, ...r }); }
    if (run.name.startsWith('nw11')) {
      res.taps.push(...taps(run).map((x) => ({ run: run.name, ...x })));
      res.shabads.push(...shabads(run).map((x) => ({ run: run.name, ...x })));
    }
  }
  all[dir] = res;
  console.log(`\n### ${dir}`);
  console.log('| run | stretch | Bani right | wrong | none | line exact | within 1 | reached | lag med | lag p90 | behind >1 | longest | stuck (no move, singer +2 lines) | premature (of 2nd-half-first) |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of res.vaar) console.log(`| ${r.run} | ${r.part} | ${r.baniRight}% | ${r.wrong}% ${r.wrongIds} | ${r.none}% | ${r.lineExact}% | ${r.lineWithin1}% | ${r.linesReached} | ${r.lagMedian} s | ${r.lagP90} s | ${r.behindPct}% | ${r.longestBehind_s} s | ${r.stuck_s} s @${r.stuckAt} | ${r.premature} (${r.prematureOfSHF}/${r.shfLines}) |`);
  for (const r of res.vaar) if (r.prematureList.length) console.log(`  ${r.run}/${r.part} premature: ${r.prematureList.map((p) => `row${p.line}@${p.at}(-${p.early_s}s->row${p.toRow})`).join(' ')}`);
  if (res.taps.length) { console.log('| run | tap | at | engine had it before the tap (s) | on screen after tap (s) |'); console.log('|---|---|---|---|---|'); for (const r of res.taps) console.log(`| ${r.run} | ${r.tap} | ${r.at} | ${r.engineBefore_s ?? 'no'} | ${r.afterTap_s ?? 'never'} |`); }
  if (res.shabads.length) { console.log('| run | shabad | real screen | how | replay | vs real |'); console.log('|---|---|---|---|---|---|'); for (const r of res.shabads) console.log(`| ${r.run} | ${r.shabad} | ${r.real} | ${r.how} | ${r.replay ?? 'never'} | ${r.vsReal_s ?? '-'} |`); }
}
fs.writeFileSync(path.join(process.argv[2], 'score.json'), JSON.stringify(all, null, 1));
