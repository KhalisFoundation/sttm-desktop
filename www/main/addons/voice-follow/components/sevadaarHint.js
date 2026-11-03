// Sevadaar hint: the sevadaar types a few first letters (as in STTM's own search) and Autopilot
// picks among the matching Shabads by what it is hearing right now. The typed letters narrow the
// field to a handful of Shabads; the hearing chooses among them. Pure functions, shared by the
// component and the unit tests.
//
// rows: banidb first-letter results, [{ shabadId, verseId, verse }] in the database's order.
// scoreOf(shabadId) -> { s, index }: how well the recent hearing matches the Shabad's best pangti
// (0..1) and which pangti (index into its lines, -1 = none). Unknown/unloaded -> { s: 0, index: -1 }.

const DEFAULTS = {
  maxShabads: 20, // distinct Shabads kept from the results
  pickMin: 0.55, // the hearing must match the best Shabad at least this well ...
  pickMargin: 0.12, // ... and beat the next one by this much
  lineMin: 0.6, // open at the heard pangti when it matches this well, else at the typed one
  // Letters found mid-pangti (not at its start) are listed for the sevadaar to tap; Autopilot picks
  // one by itself only on a much clearer hearing (mid-pangti letters match unrelated Shabads more).
  anyMin: 0.75,
  anyMargin: 0.25,
};

// One row per Shabad (its first matching pangti), in the database's order.
function distinctShabads(rows, max = DEFAULTS.maxShabads) {
  const seen = new Set();
  const out = [];
  (rows || []).forEach((r) => {
    if (!r || r.shabadId == null || seen.has(r.shabadId) || out.length >= max) return;
    seen.add(r.shabadId);
    out.push(r);
  });
  return out;
}

// Rank by what is heard (ties keep the database's order).
function rankHint(cands, scoreOf) {
  return cands
    .map((c, i) => {
      const m = scoreOf(c.shabadId) || { s: 0, index: -1 };
      return { ...c, s: m.s || 0, index: m.index == null ? -1 : m.index, order: i };
    })
    .sort((a, b) => b.s - a.s || a.order - b.order);
}

// Whether to open one now. Returns { pick, reason } or null.
//   'only'  - the letters match a single Shabad: open it (the sevadaar has said which).
//   'heard' - several match; the hearing clearly prefers one.
function decideHint(ranked, cfg = DEFAULTS) {
  if (!ranked || !ranked.length) return null;
  const [a, b] = ranked;
  const atStart = a.kind !== 'any';
  if (ranked.length === 1) return atStart ? { pick: a, reason: 'only' } : null;
  const next = b ? b.s : 0;
  if (atStart && a.s >= cfg.pickMin && a.s - next >= cfg.pickMargin)
    return { pick: a, reason: 'heard' };
  if (!atStart && a.s >= cfg.anyMin && a.s - next >= cfg.anyMargin)
    return { pick: a, reason: 'heard-any' };
  return null;
}

// The pangti to open at: the heard one when it is clear, else the one the letters matched.
// lineIds: the Shabad's verse ids in order (profile.verses).
function openAt(pick, lineIds, cfg = DEFAULTS) {
  if (pick.s >= cfg.lineMin && pick.index >= 0 && lineIds && lineIds[pick.index] != null)
    return { verseId: lineIds[pick.index], heard: true };
  return { verseId: pick.verseId, heard: false };
}

module.exports = { DEFAULTS, distinctShabads, rankHint, decideHint, openAt };
