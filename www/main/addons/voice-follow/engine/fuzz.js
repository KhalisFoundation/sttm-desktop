// JS port of the two rapidfuzz functions the follower uses.
// fuzz.ratio = normalized Indel similarity = 200*LCS/(len1+len2).
// partial_ratio = best ratio of the shorter string against any equal-length
// window of the longer string.
//
// partialRatio / partialRatioAlignment take a pangti exactly as the database gives it (a string
// or a Compared view of it, see compared.js). They read its characters in place and skip spaces,
// dandas, numbers and punctuation while comparing; the pangti itself is never changed.
const { compared } = require('./compared');

function lcs(a, b) {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return 0;
  let prev = new Int32Array(m + 1);
  let cur = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[m];
}

function ratioArr(a, b) {
  const t = a.length + b.length;
  if (t === 0) return 0;
  return (200 * lcs(a, b)) / t;
}

// LCS of the first `n` compared characters of view `a` and the `n` compared characters of view
// `b` from `b0` on (one window), read in place.
function lcsWindow(a, b, b0, n, prev0, cur0) {
  let prev = prev0.fill(0);
  let cur = cur0.fill(0);
  for (let i = 1; i <= n; i++) {
    const ai = a.code(i - 1);
    for (let j = 1; j <= n; j++) {
      cur[j] = ai === b.code(b0 + j - 1) ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    const t = prev;
    prev = cur;
    cur = t;
  }
  return prev[n];
}

// Best window of the shorter view `a` inside the longer `b`: { best, start } (best 0..100).
// stopAt100: stop at the first perfect window (partialRatio) or keep the first best (alignment).
function bestWindow(a, b, stopAt100) {
  const la = a.length;
  const prev = new Int32Array(la + 1);
  const cur = new Int32Array(la + 1);
  let best = -1;
  let start = 0;
  for (let s = 0; s + la <= b.length; s++) {
    const r = (200 * lcsWindow(a, b, s, la, prev, cur)) / (2 * la);
    if (r > best) {
      best = r;
      start = s;
    }
    if (stopAt100 && best === 100) break;
  }
  return { best, start };
}

// s1, s2: heard text or a pangti (strings or Compared views). Returns 0..100. rapidfuzz-style
// partial_ratio: best normalized-Indel ratio of the shorter text against equal-length windows
// of the longer one. (rapidfuzz adds a block-derived refinement that can shift a few points;
// the follower's Viterbi margins absorb that — validated E2E.)
function partialRatio(s1, s2) {
  let a = compared(s1);
  let b = compared(s2);
  if (a.length === 0 || b.length === 0) return 0;
  if (a.length > b.length) {
    const t = a;
    a = b;
    b = t;
  } // a = shorter
  return Math.max(0, bestWindow(a, b, true).best);
}

// returns { destEnd } — end of the best-matching block in `ln`, counted in the characters a
// comparison looks at (so destEnd / compared(ln).length is how far into the pangti the match
// ends), used only as a word-index fallback. Approximate: start of best window + matched length.
function partialRatioAlignment(s1, ln) {
  const a = compared(s1);
  const b = compared(ln);
  if (a.length === 0 || b.length === 0) return null;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  const la = shorter.length;
  const { start: bestStart } = bestWindow(shorter, longer, false);
  // destEnd measured in `ln`; if ln is the longer text this is exact, else clamp
  const destEnd = longer === b ? Math.min(b.length, bestStart + la) : b.length;
  return { destEnd };
}

module.exports = { partialRatio, partialRatioAlignment, ratioArr, lcs };
