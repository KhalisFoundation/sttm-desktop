// Fragment confirm (Pankti Cumulation, owner Oct 18): "if it's any of the options it should increase
// the weight of that option".
//
// While following, the Shabad on screen is judged against the other Shabads on the board (the
// "Changing to" card and the Possible new Shabads list). The existing switch judge and Pankti
// Cumulation (switch) both need a longish heard line (8-10+ letters); when the ragi sings slowly with
// pauses the recognizer hands over short pieces (5-9 letters) of the next pangti, and nothing counted
// them. Here every piece of at least `minLetters` letters is matched against the pangtis of each board
// candidate (partial ratio, the follower's own measure): a piece that fits a pangti of candidate X at
// >= `minScore` and beats the best pangti of the Shabad on screen by >= `minMargin` adds weight to X.
//   - a pangti unique to X adds full weight; a pangti that also fits another board candidate adds
//     `sharedW` (little);
//   - a piece shorter than `shortLetters` letters must be found verbatim in the pangti (`shortScore`):
//     a 5-letter piece fits some pangti of most Shabads at 0.8 by chance;
//   - a piece that fits the Shabad on screen too (its best pangti >= minScore) adds nothing;
//   - the same pangti again only tops up by `repeat`: different pangtis are what count;
//   - the weights fade with a time constant of `tauS` seconds of SUNG audio; a quiet decode freezes
//     them (pauses don't reset);
//   - X confirms (the screen switches) once it holds `distinctChange` different pangtis when it is
//     the "Changing to" card, or `distinctList` when it is lower on the board, and a total >= `lock`.
// Pure functions over a plain Map, shared by the component and the unit tests.

const DEFAULTS = {
  minLetters: 5,
  minScore: 0.8,
  shortLetters: 8, // a piece shorter than this must be found verbatim in the pangti (fit 1.0) ...
  shortScore: 1.0, // ... (a 5-letter piece fits some pangti of most Shabads at 0.8 by chance)
  minMargin: 0.25,
  sharedW: 0.2,
  repeat: 0.15,
  cap: 1.5,
  tauS: 90,
  distinctChange: 2,
  distinctList: 3,
  lock: 1.6,
  minLineLetters: 8, // headers and numerals are not pangtis to match
};
const LIVE = 0.3;

/** Best pangti of `linesNorm` for the heard piece `hyp`: { s, index } (s 0..1, index -1 = none). */
function bestPangti(hyp, linesNorm, ratio, cfg = DEFAULTS) {
  let best = { s: 0, index: -1 };
  (linesNorm || []).forEach((ln, i) => {
    if (!ln || ln.length < cfg.minLineLetters) return;
    const s = ratio(hyp, ln) / 100;
    if (s > best.s) best = { s, index: i };
  });
  return best;
}

/** Let `seconds` of audio pass; sung audio fades the weights, a quiet stretch freezes them. */
function elapse(store, seconds, quiet, cfg = DEFAULTS) {
  if (quiet || !(seconds > 0)) return;
  const f = Math.exp(-seconds / cfg.tauS);
  store.forEach((lines) => lines.forEach((w, i) => lines.set(i, w * f)));
}

function totalOf(lines) {
  let total = 0;
  let distinct = 0;
  if (lines)
    lines.forEach((w) => {
      total += w;
      if (w >= LIVE) distinct += 1;
    });
  return { total, distinct };
}

/**
 * One heard piece. hyp = normalized heard text; cur = { linesNorm } of the Shabad on screen;
 * cands = [{ id, linesNorm, role: 'change' | 'list' }]. ratio = partialRatio(a, b) -> 0..100.
 * Returns { hits: [{ id, index, s, w }], ready: { id, index } | null, sCur } (sCur = the Shabad on
 * screen's best pangti for this piece).
 */
function step(store, { hyp, cur, cands }, ratio, cfg = DEFAULTS) {
  const out = { hits: [], ready: null, sCur: 0 };
  if (!hyp || hyp.length < cfg.minLetters) return out;
  const sCur = cur ? bestPangti(hyp, cur.linesNorm, ratio, cfg).s : 0;
  out.sCur = sCur;
  if (sCur >= cfg.minScore) return out; // fits the Shabad on screen too: no evidence either way
  const need = hyp.length < cfg.shortLetters ? cfg.shortScore : cfg.minScore;
  const fits = cands
    .map((c) => ({ c, m: bestPangti(hyp, c.linesNorm, ratio, cfg) }))
    .filter(({ m }) => m.index >= 0 && m.s >= need && m.s - sCur >= cfg.minMargin);
  fits.forEach(({ c, m }) => {
    const shared = fits.some((o) => o.c.id !== c.id);
    const w = shared ? cfg.sharedW : 1;
    let lines = store.get(c.id);
    if (!lines) {
      lines = new Map();
      store.set(c.id, lines);
    }
    const old = lines.get(m.index);
    lines.set(m.index, Math.min(cfg.cap, old != null ? old + cfg.repeat * w : w));
    out.hits.push({ id: c.id, index: m.index, s: m.s, w });
    const { total, distinct } = totalOf(lines);
    const need = c.role === 'change' ? cfg.distinctChange : cfg.distinctList;
    if (!out.ready && total >= cfg.lock && distinct >= need)
      out.ready = { id: c.id, index: m.index };
  });
  return out;
}

/** { total, distinct } of one candidate (for the panel / tests). */
const of = (store, id) => totalOf(store.get(id));

module.exports = { DEFAULTS, bestPangti, elapse, step, of };
