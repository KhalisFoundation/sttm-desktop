// Pankti Cumulation: pangtis add up per Shabad, pauses don't reset.
//
// A Shabad is a set of pangtis. When the ragi sings one pangti and then another of the same
// Shabad, each one ADDS to that Shabad's confidence instead of the search starting over on every
// pangti. Rules (each covered by panktiCumulation.test.js):
//   - a pangti heard for the first time adds its weight; a repeat of a pangti already heard only
//     tops it up by `repeat` (a half pangti sung many times keeps that pangti alive but is not a
//     new pangti), so different pangtis count much more than one pangti twice;
//   - a pangti next to (within 2 lines of) one already heard gets a `neighbour` bonus;
//   - the weight of a heard line is how UNIQUE its match is: margin over the next distinct Shabad
//     divided by `marginFull` (capped at 1), so a pangti shared by several Shabads adds ~0;
//   - evidence fades with a time constant of `tauS` seconds of SUNG audio; a quiet decode (alaap,
//     a held vowel, tabla, silence) freezes the clock, so nothing resets on a pause;
//   - a Shabad is ready when its total reaches `lock` over >= `distinct` different pangtis and is
//     `lead` times any other Shabad's total.
// Pure functions over a plain Map, so the component and the tests share one implementation.

const DEFAULTS = {
  minScore: 0.35, // a heard line counts only when it matches its pangti at least this well
  minMargin: 0.05, // ...and leads the next distinct Shabad by at least this much
  marginFull: 0.15, // margin that earns the full weight (shared pangtis earn ~0)
  repeat: 0.15, // top-up for a pangti already heard
  neighbour: 0.35, // bonus for a new pangti within 2 lines of one already heard
  tauS: 90, // seconds of sung audio for the evidence to fade to 1/e
  lock: 1.4,
  distinct: 2,
  lead: 1.5,
  cap: 1.5, // most a single pangti can hold
};

const LIVE = 0.3; // a pangti with at least this weight counts as heard

/** Total weight and number of heard pangtis of one Shabad's lines (Map verseId -> weight). */
function shabadTotal(lines) {
  let total = 0;
  let distinct = 0;
  if (lines)
    lines.forEach((w) => {
      total += w;
      if (w >= LIVE) distinct += 1;
    });
  return { total, distinct };
}

/** Let `seconds` of audio pass: sung audio fades every pangti, a quiet stretch freezes them. */
function elapse(store, seconds, quiet, cfg = DEFAULTS) {
  if (quiet || !(seconds > 0)) return;
  const f = Math.exp(-seconds / cfg.tauS);
  store.forEach((lines) => lines.forEach((w, v) => lines.set(v, w * f)));
}

/**
 * Add one heard line. hit = { shabadId, verseId, score, margin, w? } (w scales the weight, e.g.
 * for a half-pangti piece). Returns null when the line does not count, else the Shabad's
 * { total, distinct, next, ready } after adding (next = the best other Shabad's total).
 */
function addHit(store, hit, cfg = DEFAULTS) {
  if (!hit || hit.shabadId == null || hit.score < cfg.minScore || hit.margin < cfg.minMargin)
    return null;
  const w = (hit.w ?? 1) * Math.min(1, hit.margin / cfg.marginFull);
  let lines = store.get(hit.shabadId);
  if (!lines) {
    lines = new Map();
    store.set(hit.shabadId, lines);
  }
  const old = lines.get(hit.verseId);
  if (old != null) lines.set(hit.verseId, Math.min(cfg.cap, old + cfg.repeat * w));
  else {
    let add = w;
    lines.forEach((e, v) => {
      if (Math.abs(v - hit.verseId) <= 2 && e >= LIVE) add = w * (1 + cfg.neighbour);
    });
    lines.set(hit.verseId, Math.min(cfg.cap, add));
  }
  const own = shabadTotal(lines);
  let next = 0;
  store.forEach((l, sid) => {
    if (sid !== hit.shabadId) next = Math.max(next, shabadTotal(l).total);
  });
  const ready =
    own.total >= cfg.lock && own.distinct >= cfg.distinct && own.total >= cfg.lead * next;
  return { ...own, next, ready };
}

module.exports = { DEFAULTS, shabadTotal, elapse, addHit };
