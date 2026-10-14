// JS port of the two rapidfuzz functions the follower uses.
// fuzz.ratio = normalized Indel similarity = 200*LCS/(len1+len2).
// partial_ratio = best ratio of the shorter string against any equal-length
// window of the longer string.

function lcs(a, b) {
  const n = a.length, m = b.length;
  if (n === 0 || m === 0) return 0;
  let prev = new Int32Array(m + 1);
  let cur = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      cur[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1] + 1
        : Math.max(prev[j], cur[j - 1]);
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

// s1, s2: strings. Returns 0..100. rapidfuzz-style partial_ratio: best
// normalized-Indel ratio of the shorter string against equal-length windows of
// the longer one. (rapidfuzz adds a block-derived refinement that can shift a
// few points; the follower's Viterbi margins absorb that — validated E2E.)
function partialRatio(s1, s2) {
  let a = [...s1], b = [...s2];
  if (a.length === 0 || b.length === 0) return 0;
  if (a.length > b.length) { const t = a; a = b; b = t; }  // a = shorter
  const la = a.length;
  if (la === b.length) return ratioArr(a, b);
  let best = 0;
  for (let start = 0; start + la <= b.length; start++) {
    const r = ratioArr(a, b.slice(start, start + la));
    if (r > best) best = r;
    if (best === 100) break;
  }
  return best;
}

// returns { destEnd } — end offset in `ln` of the best-matching block, used only
// as a word-index fallback. Approximate: start of best window + matched length.
function partialRatioAlignment(s1, ln) {
  const a = [...s1], b = [...ln];
  if (a.length === 0 || b.length === 0) return null;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  const la = shorter.length;
  let best = -1, bestStart = 0;
  for (let start = 0; start + la <= longer.length; start++) {
    const r = ratioArr(shorter, longer.slice(start, start + la));
    if (r > best) { best = r; bestStart = start; }
  }
  // destEnd measured in `ln`; if ln is the longer string this is exact, else clamp
  const destEnd = (longer === b) ? Math.min(b.length, bestStart + la) : b.length;
  return { destEnd };
}

module.exports = { partialRatio, partialRatioAlignment, ratioArr, lcs };
