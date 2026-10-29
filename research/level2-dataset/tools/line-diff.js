// line-diff.js — per clip and per line: did the candidate follow the lines better or worse than the base?
// Truth = line-truth.js output (<cache>/line-truth/truth/<clip>.json); screen = the replay traces
// (<run>/<side>/<suite>/trace/<clip>.events.jsonl, times in clip seconds).
// Per clip: line exact % / within one line % (over the truth lines' time, confident lines only),
// median lag (first time a line is shown, from 5 s before to 60 s after its start); per line:
// better / worse = shown at least 0.5 s earlier / later (or shown vs never).
const fs = require('fs');
const path = require('path');

const STEP = 0.1;
const MINCHK = 0.6;

function screenTimeline(trace) {
  return fs.readFileSync(trace, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    .filter((e) => e.type === 'verse' || e.type === 'shabad' || e.type === 'seeking');
}

function score(truth, events) {
  const lines = truth.lines.filter((l) => l.check >= MINCHK);
  const idxOf = new Map();
  truth.lines.forEach((l) => { if (!idxOf.has(l.verseId)) idxOf.set(l.verseId, l.i); });
  let verse = null;
  let seeking = false;
  let k = 0;
  let exact = 0;
  let near = 0;
  let total = 0;
  for (const l of lines) {
    for (let t = l.start; t < l.end; t += STEP) {
      while (k < events.length && events[k].t <= t) {
        const e = events[k++];
        if (e.type === 'verse') verse = e.verseId;
        else if (e.type === 'shabad' && e.verseId != null) verse = e.verseId;
        else if (e.type === 'seeking') seeking = e.visible;
      }
      total += STEP;
      if (seeking || verse == null) continue;
      if (verse === l.verseId) { exact += STEP; near += STEP; } else if (idxOf.has(verse) && Math.abs(idxOf.get(verse) - l.i) <= 1) near += STEP;
    }
  }
  // note: lines sorted by start in align output; the cursor above only moves forward
  const shownAt = (l) => {
    const e = events.find((x) => (x.type === 'verse' || x.type === 'shabad') && x.verseId === l.verseId && x.t >= l.start - 5 && x.t <= l.start + 60);
    return e ? +(e.t - l.start).toFixed(2) : null;
  };
  const lags = lines.map(shownAt);
  const got = lags.filter((x) => x != null).sort((a, b) => a - b);
  return { exact: total ? +(100 * exact / total).toFixed(1) : null, within1: total ? +(100 * near / total).toFixed(1) : null,
    lagMedian: got.length ? got[Math.floor(got.length / 2)] : null, reached: got.length, lines: lines.length, lags, lineRefs: lines };
}

function diffClip(truthFile, traceA, traceB) {
  if (!fs.existsSync(truthFile) || !fs.existsSync(traceA) || !fs.existsSync(traceB)) return null;
  const truth = JSON.parse(fs.readFileSync(truthFile, 'utf8'));
  const a = score(truth, screenTimeline(traceA));
  const b = score(truth, screenTimeline(traceB));
  let better = 0;
  let worse = 0;
  const changed = [];
  a.lags.forEach((la, n) => {
    const lb = b.lags[n];
    let v = 0;
    if (la == null && lb != null) v = 1;
    else if (la != null && lb == null) v = -1;
    else if (la != null && lb != null && Math.abs(lb - la) >= 0.5) v = lb < la ? 1 : -1;
    if (v > 0) better++;
    if (v < 0) worse++;
    if (v) changed.push({ line: a.lineRefs[n].i, verseId: a.lineRefs[n].verseId, start: a.lineRefs[n].start, base: la, cand: lb, verdict: v > 0 ? 'better' : 'worse' });
  });
  const strip = ({ lags, lineRefs, ...r }) => r;
  return { base: strip(a), cand: strip(b), better, worse, changed };
}

module.exports = { diffClip, score };
