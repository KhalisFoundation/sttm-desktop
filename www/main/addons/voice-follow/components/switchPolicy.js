// Pure decision policy for autopilot shabad switching + candidate display.
// Extracted from VoiceFollow.jsx so it can be unit-tested without React.
// Only dependency is the engine's pure string-similarity module (no ONNX,
// no native code), so plain node can require it directly.
const { partialRatio, lcs } = require('../engine/fuzz');

// Advance the consecutive-win counter for an in-flight switch evaluation.
// cfg: { min, margin, strongMin, strongMargin }. The commit threshold lives
// with the caller (it owns SWITCH_CONFIRM); this only counts wins.
// - A decode is "winning" when the candidate clearly beats the current shabad.
// - A "strong" win (far above the confusion zone) counts double, so decisive
//   real switches commit in ~2 decodes instead of ~3. Borderline matches keep
//   the full confirmation count — the false-switch protection is unchanged.
// - A non-winning decode steps back by one (floor 0), as before.
// - Heard-length hold: when cfg.hypMin > 0 and the heard fragment is shorter
//   (cfg.hypLen), the decode is too thin to judge — hold wins unchanged
//   (neither a win nor a step back). Short fragments fully contained in an
//   unrelated short line score ~1.0 and were the dominant false-switch source
//   on sung kirtan; waiting half a second for more audio costs ~nothing.
// Returns { wins, decisive, held } where decisive flags a strong win this
// decode and held flags a too-thin fragment (wins frozen, nothing judged).
function nextSwitchWins(wins, sCand, sCur, cfg) {
  if (cfg.hypMin > 0 && (cfg.hypLen || 0) < cfg.hypMin) {
    return { wins, decisive: false, held: true };
  }
  const margin = sCand - sCur;
  const winning = sCand >= cfg.min && margin >= cfg.margin;
  if (!winning) return { wins: Math.max(0, wins - 1), decisive: false, held: false };
  const strong = sCand >= cfg.strongMin && margin >= cfg.strongMargin;
  return { wins: wins + (strong ? 2 : 1), decisive: strong, held: false };
}

// Hold the visible candidate shortlist across transient empty decodes.
// Sung audio often yields a decode with no banidb hit; wiping the shortlist
// on every such decode makes the candidates flash and vanish. Only clear
// after holdDecodes CONSECUTIVE empty decodes.
// Returns { streak, clear }.
function nextEmptyStreak(streak, hasVotes, holdDecodes) {
  if (hasVotes) return { streak: 0, clear: false };
  const next = streak + 1;
  return { streak: next, clear: next > holdDecodes };
}

// Best fuzzy match of the recently decoded audio against any line of a shabad — the
// same measure the follower uses per-line, so scores for two shabads are directly
// comparable. Used to judge "does the voice now match this OTHER shabad better?".
// minLineChars > 0 applies a length-aware containment penalty: partialRatio is
// asymmetric (it rewards a SHORT line found as a substring of a longer hyp), so a
// 1-line shabad can score ~1.0 against a fragment of unrelated audio — the dominant
// source of jarring ERRONEOUS switches on a large shabad field. Scaling each line's
// score by min(1, lineLen/minLineChars) makes a short line clear a proportionally
// higher raw bar before it can win. Cross-validated on real kirtan: cut erroneous
// on the 86-min stream (13.2->10.5) and the 20-singer stream (~34->28) with no
// recall loss and neutral on clean short-segment streams (offline sung-kirtan
// benchmark; the audio harness is kept out of the repo with the audio corpus).
function maxLineScore(hypNorm, linesNorm, minLineChars = 0) {
  if (!hypNorm || !linesNorm || !linesNorm.length) return 0;
  let best = 0;
  for (let i = 0; i < linesNorm.length; i += 1) {
    const ln = linesNorm[i];
    if (ln) {
      let s = partialRatio(hypNorm, ln) / 100;
      if (minLineChars > 0) s *= Math.min(1, ln.length / minLineChars);
      if (s > best) best = s;
    }
  }
  return best;
}

// First-letter screen for the acoustic backstop: which shabads could plausibly
// match what's been heard, ranked by longest-common-subsequence overlap of the
// heard first-letters against each shabad's first-letter string. Cheap
// (substring DP on short strings), so it can run over the whole shabad field
// every decode; only survivors get the expensive text rescore.
// flBySid: Map (or object) shabadId -> first-letter string. Excludes excludeId.
// Returns [{ id, overlap }] sorted best-first, capped at cap entries.
function screenByFirstLetters(heardFL, flBySid, excludeId, minOverlap, cap) {
  const out = [];
  if (!heardFL) return out;
  const push = (id, fl) => {
    // eslint-disable-next-line eqeqeq
    if (id == excludeId || id == null || !fl) return;
    // Free bound: an overlap can never exceed the shorter string.
    if (Math.min(heardFL.length, fl.length) < minOverlap) return;
    const overlap = lcs(heardFL, fl);
    if (overlap >= minOverlap) out.push({ id, overlap });
  };
  if (flBySid instanceof Map) flBySid.forEach((fl, id) => push(id, fl));
  else Object.keys(flBySid).forEach((id) => push(id, flBySid[id]));
  out.sort((a, b) => b.overlap - a.overlap);
  return cap > 0 ? out.slice(0, cap) : out;
}

// Best fuzzy line match WITH its line index, so the caller can map the winning
// line back to its verse (for display + lock payload). Same scoring as
// maxLineScore (share the penalty semantics); returns { s, index } with
// index -1 when nothing scores.
function bestLineMatch(hypNorm, linesNorm, minLineChars = 0) {
  if (!hypNorm || !linesNorm || !linesNorm.length) return { s: 0, index: -1 };
  let best = 0;
  let at = -1;
  for (let i = 0; i < linesNorm.length; i += 1) {
    const ln = linesNorm[i];
    if (ln) {
      let s = partialRatio(hypNorm, ln) / 100;
      if (minLineChars > 0) s *= Math.min(1, ln.length / minLineChars);
      if (s > best) {
        best = s;
        at = i;
      }
    }
  }
  return { s: best, index: at };
}


// Order-tolerant line match for the CURRENT shabad. Kirtan constantly re-sings
// the rahao and rotates word order ("tera ant na jaana mere laal" for the line
// "mere laal jio tera ant na jaana"). partialRatio is order-sensitive, so the
// current shabad can score ~0.6 on its own line while some other shabad that
// happens to hold the same words in the sung order scores ~0.9 — the dominant
// false-switch mechanism on long live kirtan (Level 2 benchmark, clip 20:
// every wrong switch left the correct shabad while its rahao was being sung).
// Compare word-sorted strings instead: the same bag of words scores the same
// regardless of order. hypWords / linesWords are arrays of normalized words.
// minLineChars applies the same length-aware containment penalty as
// maxLineScore so a tiny line cannot win by being contained in the hyp.
function orderFreeLineScore(hypWords, linesWords, minLineChars = 0) {
  if (!hypWords || hypWords.length < 2 || !linesWords || !linesWords.length) return 0;
  const hyp = hypWords.slice().sort().join('');
  let best = 0;
  for (let i = 0; i < linesWords.length; i += 1) {
    const words = linesWords[i];
    if (words && words.length) {
      const ln = words.slice().sort().join('');
      let s = partialRatio(hyp, ln) / 100;
      if (minLineChars > 0) s *= Math.min(1, ln.length / minLineChars);
      if (s > best) best = s;
    }
  }
  return best;
}

module.exports = {
  nextSwitchWins,
  nextEmptyStreak,
  maxLineScore,
  screenByFirstLetters,
  bestLineMatch,
  orderFreeLineScore,
};
