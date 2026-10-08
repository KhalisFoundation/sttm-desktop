// Live candidate board for the Voice-Follow panel: what is being heard right now, and how
// sure the app is about each Shabad in contention. Display only, never feeds a decision.
//
// The percentages are not cosmetic. Each decode gives a real match score (0-1) for the
// current Shabad and for every challenger the switch judge is weighing; evidence per Shabad
// is a decayed running sum of those scores, and the shown % is a posterior over the Shabads
// in contention (plus "some other Shabad"), mapped through a per-role calibration fitted on
// recordings with known truth (research/ui-calib): of all the moments a card showed 90%, it
// was the Shabad being sung about 90% of the time. While searching (nothing locked yet) the
// first-letter votes are the evidence, with a fitted mass for "not found yet".

// Fitted in research/ui-calib/fit_posterior2.py and fit_search.py (see posterior.json).
const DEFAULTS = {
  beta: 12, // evidence per unit of match score per decode
  lam: 0.65, // per-decode decay (~0.5 s decodes: evidence half-life under a second)
  other: 0.2, // per-decode evidence for "some other Shabad"
  inc: 6, // incumbency: the Shabad on screen has been right far more often than a challenger
  // Logit-scale calibration per role (held out by recording: current card shown 94.8% was
  // right 94.4%, 98.6% -> 98.5%, 99.9% -> 99.8%; challenger shown 1.0% -> 1.0%, 15.7% -> 14.6%).
  platt: { cur: [0.5011, 0.3577], ch: [0.4639, 0.1432] },
  // While searching the leader is rarely right before the lock (shown 4.2% -> right 2.3%,
  // 13.3% -> 8.9%), so its share is taken against a large "not found yet" mass.
  searchK: 256,
  hold: 3000, // ms a challenger stays listed after its last score (its evidence keeps decaying)
  decodeMs: 510,
};

const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const logit = (p) => {
  const q = Math.min(Math.max(p, 1e-6), 1 - 1e-6);
  return Math.log(q / (1 - q));
};

function createBoard(params = {}) {
  const P = { ...DEFAULTS, ...params, platt: { ...DEFAULTS.platt, ...(params.platt || {}) } };
  const E = new Map(); // shabadId -> evidence
  const seen = new Map(); // shabadId -> last time scored (ms)
  const meta = new Map(); // shabadId -> { line, verseId, verse }
  let lastAt = 0;
  let current = null;
  let items = []; // [{ shabadId, pct, role }] newest computation
  let phase = 'idle';
  let progressItems = []; // searching phase: lock progress per Shabad (see progress())
  let progressAt = 0;

  const decay = (now) => {
    const gap = lastAt ? Math.max(1, Math.round((now - lastAt) / P.decodeMs)) : 1;
    lastAt = now;
    const f = P.lam ** gap;
    E.forEach((v, k) => E.set(k, v * f));
  };
  const remember = (c) => {
    if (c && c.shabadId != null && (c.line || c.verse))
      meta.set(c.shabadId, { line: c.line, verseId: c.verseId, verse: c.verse });
  };

  // One following-phase decode: the current Shabad's score and each challenger's score.
  function follow({ now, cur, sCur, cands = [] }) {
    if (phase !== 'following' || current !== cur) {
      // A new current Shabad keeps the evidence it earned as a challenger.
      phase = 'following';
      current = cur;
      progressItems = [];
    }
    decay(now);
    E.set(cur, (E.get(cur) || 0) + P.beta * sCur);
    seen.set(cur, now);
    cands.forEach((c) => {
      if (c.shabadId === cur) return;
      E.set(c.shabadId, (E.get(c.shabadId) || 0) + P.beta * c.score);
      seen.set(c.shabadId, now);
      remember(c);
    });
    const keys = [cur, ...[...seen.keys()].filter((k) => k !== cur && now - seen.get(k) <= P.hold)];
    const z = keys.map((k) => (E.get(k) || 0) + (k === cur ? P.inc : 0));
    z.push((P.beta * P.other) / (1 - P.lam));
    const m = Math.max(...z);
    const ex = z.map((v) => Math.exp(v - m));
    const S = ex.reduce((a, b) => a + b, 0);
    items = keys.map((k, i) => {
      const [a, b] = k === cur ? P.platt.cur : P.platt.ch;
      return {
        shabadId: k,
        pct: sigmoid(a * logit(ex[i] / S) + b),
        role: k === cur ? 'current' : 'candidate',
      };
    });
    // Each role is calibrated on its own, so during a change the current card and a challenger
    // can add up to more than 100%. Shown side by side that reads as a contradiction; share
    // them out so the cards on screen never total more than 100%.
    const total = items.reduce((acc, it) => acc + it.pct, 0);
    if (total > 1) items = items.map((it) => ({ ...it, pct: it.pct / total }));
    [...seen.keys()].forEach((k) => {
      if (k !== cur && now - seen.get(k) > P.hold) {
        seen.delete(k);
        E.delete(k);
      }
    });
  }

  // While a session holds the current Shabad but nobody is singing: no new evidence.
  function hold(now) {
    if (phase !== 'following') return;
    lastAt = now;
  }

  // Searching phase, lock progress: how close each Shabad is to being chosen, from the
  // same evidence the lock itself uses (full-text tally, paath text pool, acoustic votes).
  // Shown as a fill that climbs toward the lock, so the pick never arrives from nowhere.
  function progress(list, now) {
    phase = 'searching';
    current = null;
    progressItems = list.filter((it) => it.pct >= 0.05).map((it) => ({ ...it, role: 'candidate' }));
    progressAt = now;
    if (progressItems.length) items = progressItems;
  }
  const known = (id) => meta.has(id);

  // One searching-phase decode: ranked [[shabadId, votes], ...] (votes already decay).
  // First-letter votes only fill the box while no lock route has evidence yet.
  function search({ ranked, rows, now = Date.now() }) {
    phase = 'searching';
    current = null;
    if (progressItems.length && now - progressAt < 4000) {
      items = progressItems;
      return;
    }
    const top = ranked.slice(0, 3);
    const total = top.reduce((a, [, v]) => a + v, 0) + P.searchK;
    items = top.map(([sid, v]) => {
      const row = rows && rows.get ? rows.get(sid) : null;
      if (row) remember({ shabadId: sid, verseId: row.verseId, verse: row.verse });
      return { shabadId: sid, pct: v / total, role: 'candidate' };
    });
  }

  function reset() {
    progressItems = [];
    progressAt = 0;
    E.clear();
    seen.clear();
    items = [];
    current = null;
    lastAt = 0;
    phase = 'idle';
  }

  function snapshot() {
    return items
      .map((it) => ({ ...it, ...(meta.get(it.shabadId) || {}) }))
      .sort((a, b) => (b.role === 'current') - (a.role === 'current') || b.pct - a.pct);
  }

  return { follow, hold, search, progress, known, reset, snapshot, remember, params: P };
}

// Rolling transcript: each decode returns the text of the last ~10 s of audio, so successive
// hypotheses overlap. Append only the words past the longest overlap; keep the tail.
function mergeTranscript(stream, text, keep = 16) {
  const real = (w) => /[\u0A05-\u0A39\u0A59-\u0A5E\u0A72-\u0A74]/.test(w);
  const a = (stream || '').split(/\s+/).filter(real);
  const b = (text || '').split(/\s+/).filter(real);
  if (!b.length) return stream || '';
  let best = 0;
  for (let k = Math.min(a.length, b.length); k > 0; k -= 1) {
    let ok = true;
    for (let i = 0; i < k && ok; i += 1) if (a[a.length - k + i] !== b[i]) ok = false;
    if (ok) {
      best = k;
      break;
    }
  }
  // No word-level overlap: the window moved on (or the recognizer re-spelled it); start the
  // new window after a light separator rather than repeating a near-duplicate line.
  let merged;
  if (best) merged = [...a, ...b.slice(best)];
  else if (a.length && b.some((w) => a.slice(-b.length).includes(w)))
    merged = [...a.slice(0, -Math.min(a.length, b.length)), ...b];
  else merged = [...a, ...b];
  return merged.slice(-keep).join(' ');
}

module.exports = { createBoard, mergeTranscript, DEFAULTS };
