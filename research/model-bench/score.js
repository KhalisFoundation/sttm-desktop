#!/usr/bin/env node
/* score.js - hearing score per behaviour x model from infer.py transcripts (see README.md).
 *
 * Per window with Shabad truth (the truth row covering window end - 2 s):
 *   hit@1 / hit@5  the app's own search (engine/retrieval/text-index.js TextIndex over the pinned corpus) on the
 *                  window's transcript: is the true Shabad the top / among the top 5 distinct Shabads? A copy of the
 *                  same Gurbani in another Shabad counts as right (the app's sameGurbani); a Bani truth row
 *                  (bani:<id>) counts any Shabad of that Bani as right (bani-members.json).
 *   usable         the transcript has >= 8 letters after the app's normalisation (the search phase's minimum).
 *   vote / wrong   the Shabad most often top-1 over the last 30 s of windows (>= 3 votes, strict leader) is right /
 *                  wrong: a logic-free use of the model's hearing over time.
 * Results are window-weighted per behaviour (tier).
 *
 *   node score.js [--data data] [--transcripts transcripts] [--models a,b] [--md results.md] [--json results.json]
 */
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const ROOT = path.resolve(__dirname, '../..');
const { TextIndex } = require(path.join(ROOT, 'www/main/addons/voice-follow/engine/retrieval/text-index.js'));
const { sameGurbani } = require(path.join(ROOT, 'www/main/addons/voice-follow/components/switchPolicy.js'));

const DATA = arg('data', path.join(__dirname, 'data'));
const TR = arg('transcripts', path.join(__dirname, 'transcripts'));
const SAMPLE = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample.json'), 'utf8'));
const corpus = JSON.parse(fs.readFileSync(path.join(DATA, 'scoring/corpus.json'), 'utf8'));
const BANI = JSON.parse(fs.readFileSync(path.join(DATA, 'scoring/bani-members.json'), 'utf8')).members;
const idx = new TextIndex(corpus);
const verse = new Map(corpus.map((r) => [r.verseId, r]));
const linesOf = new Map();
corpus.forEach((r) => (r.shabadIds || [r.shabadId]).forEach((s) => { if (!linesOf.has(s)) linesOf.set(s, []); linesOf.get(s).push(r.text); }));
const sameMemo = new Map();
const same = (a, b) => { const k = a < b ? `${a}:${b}` : `${b}:${a}`; if (!sameMemo.has(k)) sameMemo.set(k, sameGurbani(linesOf.get(a) || [], linesOf.get(b) || [])); return sameMemo.get(k); };
const isRight = (s, ok) => ok.has(s) || (typeof s === 'number' && [...ok].some((o) => typeof o === 'number' && same(s, o)));
const norm = (s) => (s || '').replace(/[\s।॥|0-9੦-੯.,;:!?-]+/g, ''); // = the engine's normalisation
const MIN_LETTERS = 8;
const VOTE_S = 30;

const models = (arg('models', '') || fs.readdirSync(TR).filter((d) => fs.existsSync(path.join(TR, d, 'meta.json'))).sort().join(','))
  .split(',').filter(Boolean);

function csv(file) {
  if (!fs.existsSync(file)) return [];
  const [head, ...rows] = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const keys = head.split(',');
  return rows.map((l) => Object.fromEntries(l.split(',').map((v, i) => [keys[i], v])));
}
function truthOf(clip) {
  // Only model-independent truth: a row labelled by aligning with a speech model would flatter that model.
  const sh = csv(path.join(DATA, 'clips', clip.id, 'shabads.csv')).filter((r) => r.start_s !== '' && r.end_s !== '' && !/^aligned/.test(r.source || ''))
    .map((r) => ({ ids: String(r.shabadId).split('|').flatMap((x) => (/^bani:/.test(x) ? [x, ...(BANI[x.slice(5)] || [])] : [Number(x)])), a: +r.start_s, b: +r.end_s }));
  if (clip.coldFirst && sh.length) sh.reduce((m, r) => (r.a < m.a ? r : m)).a = 0; // the first Shabad counts from the clip start
  return (t) => { const s = new Set(); sh.forEach((r) => { if (r.a <= t && r.b >= t) r.ids.forEach((x) => s.add(x)); }); return s.size ? s : null; };
}

const memo = new Map();
function topShabads(text) {
  if (memo.has(text)) return memo.get(text);
  const out = []; const seen = new Set();
  for (const c of idx.search(text, 60)) {
    if (seen.has(c.shabadId)) continue;
    seen.add(c.shabadId); out.push({ s: c.shabadId, v: c.verseId });
    if (out.length >= 5) break;
  }
  memo.set(text, out);
  return out;
}
const candRight = (c, ok) => isRight(c.s, ok) || ((verse.get(c.v) || {}).shabadIds || []).some((s) => ok.has(s));
const rankOf = (text, ok) => {
  if (norm(text).length < MIN_LETTERS) return -1;
  const r = topShabads(text);
  for (let i = 0; i < r.length; i++) if (candRight(r[i], ok)) return i;
  return -1;
};

const pct = (a, n) => (n ? +(100 * a / n).toFixed(1) : null);
const perWindow = {};
const clipRows = [];
for (const clip of SAMPLE.clips) {
  const truth = truthOf(clip);
  const row = { clip: clip.id, tier: clip.tier, models: {} };
  for (const m of models) {
    const f = path.join(TR, m, `${clip.id}.jsonl`);
    if (!fs.existsSync(f)) continue;
    const win = JSON.parse(fs.readFileSync(path.join(TR, m, 'meta.json'), 'utf8')).window_s;
    const rows = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const W = [];
    for (const r of rows) {
      if (r.t < clip.start + win - 1e-6 || r.t > clip.end + 1e-6) continue;
      const ok = truth(r.t - 2);
      if (!ok) continue;
      W.push({ t: r.t, rank: rankOf(r.text, ok), usable: norm(r.text).length >= MIN_LETTERS, ok });
    }
    const tops = rows.filter((r) => r.t <= clip.end + 1e-6).map((r) => ({ t: r.t, s: norm(r.text).length >= MIN_LETTERS ? (topShabads(r.text)[0] || {}).s ?? null : null }));
    let j0 = 0;
    for (const w of W) {
      const cnt = new Map();
      while (j0 < tops.length && tops[j0].t <= w.t - VOTE_S) j0++;
      for (let j = j0; j < tops.length && tops[j].t <= w.t; j++) if (tops[j].s != null) cnt.set(tops[j].s, (cnt.get(tops[j].s) || 0) + 1);
      const sorted = [...cnt.entries()].sort((a, b) => b[1] - a[1]);
      const vote = sorted.length && sorted[0][1] >= 3 && (sorted.length === 1 || sorted[0][1] > sorted[1][1]) ? sorted[0][0] : null;
      w.voteRight = vote != null && isRight(vote, w.ok);
      w.voteWrong = vote != null && !w.voteRight;
    }
    (perWindow[m] = perWindow[m] || {})[clip.id] = W;
    row.models[m] = { n: W.length, hit1: pct(W.filter((w) => w.rank === 0).length, W.length), hit5: pct(W.filter((w) => w.rank >= 0).length, W.length) };
  }
  clipRows.push(row);
}

// Windows overlap (1 s hop), so the real sample size is about the number of clips: uncertainty comes from resampling
// whole clips (bootstrap, 2000 draws, fixed seed so the intervals reproduce). The difference is model - baseline, where
// the baseline is the model named by --baseline (default: the one starting "karanbir") at the same window length.
let seed = 12345;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const hits = (W) => [W.filter((w) => w.rank >= 0).length, W.length];
const winOf = (m) => JSON.parse(fs.readFileSync(path.join(TR, m, 'meta.json'), 'utf8')).window_s;
const baseOf = (m) => models.find((b) => b.startsWith(arg('baseline', 'karanbir')) && winOf(b) === winOf(m));
const agg = [];
for (const tier of Object.keys(SAMPLE.tiers)) {
  for (const m of models) {
    const clips = SAMPLE.clips.filter((c) => c.tier === tier && perWindow[m] && perWindow[m][c.id]);
    const W = clips.flatMap((c) => perWindow[m][c.id]);
    if (!W.length) continue;
    const per = clips.map((c) => hits(perWindow[m][c.id])).filter(([, n]) => n);
    const r = { tier, model: m, clips: clips.length, windows: W.length,
      hit1: pct(W.filter((w) => w.rank === 0).length, W.length), hit5: pct(W.filter((w) => w.rank >= 0).length, W.length),
      hit5ClipMean: +(per.reduce((a, [h, n]) => a + 100 * h / n, 0) / per.length).toFixed(1),
      usable: pct(W.filter((w) => w.usable).length, W.length),
      vote: pct(W.filter((w) => w.voteRight).length, W.length), voteWrong: pct(W.filter((w) => w.voteWrong).length, W.length) };
    const b = baseOf(m);
    if (b && b !== m) {
      const pairs = clips.filter((c) => perWindow[b] && perWindow[b][c.id]).map((c) => [hits(perWindow[m][c.id]), hits(perWindow[b][c.id])]);
      const diff = (P) => { let hm = 0; let nm = 0; let hb = 0; let nb = 0; P.forEach(([[a, n], [c, k]]) => { hm += a; nm += n; hb += c; nb += k; }); return 100 * (hm / nm - hb / nb); };
      const draws = [];
      for (let i = 0; i < 2000; i++) draws.push(diff(pairs.map(() => pairs[Math.floor(rand() * pairs.length)])));
      draws.sort((x, y) => x - y);
      r.vsBaseline = { baseline: b, diff: +diff(pairs).toFixed(1), ci95: [+draws[49].toFixed(1), +draws[1949].toFixed(1)] };
      r.vsBaseline.clear = r.vsBaseline.ci95[0] > 0 || r.vsBaseline.ci95[1] < 0;
    }
    agg.push(r);
  }
}

const L = ['| Behaviour | Model | Clips | Windows | hit@5 % | hit@5 per-clip avg % | vs baseline (95% CI) | hit@1 % | Usable % | 30 s vote right % (wrong %) |', '|---|---|---|---|---|---|---|---|---|---|'];
for (const r of agg) {
  const v = r.vsBaseline;
  const vs = v ? `${v.diff > 0 ? '+' : ''}${v.diff} [${v.ci95[0]}, ${v.ci95[1]}]${v.clear ? ' clear' : ' not clear'}` : 'baseline';
  L.push(`| ${SAMPLE.tiers[r.tier]} | ${r.model} | ${r.clips} | ${r.windows} | ${r.hit5} | ${r.hit5ClipMean} | ${vs} | ${r.hit1} | ${r.usable} | ${r.vote} (${r.voteWrong}) |`);
}
const md = L.join('\n') + '\n';
process.stdout.write(md);
if (arg('md')) fs.writeFileSync(arg('md'), md);
// Provenance: which app search code scored this (score.js loads it from the working tree).
const { execSync } = require('child_process');
const crypto = require('crypto');
const fileSha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');
let commit = null;
try { commit = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch (_) { /* not a git checkout */ }
const provenance = { commit, gab_revision: SAMPLE.gab_revision,
  files: Object.fromEntries(['www/main/addons/voice-follow/engine/retrieval/text-index.js', 'www/main/addons/voice-follow/components/switchPolicy.js']
    .map((f) => [f, fileSha(f)])),
  transcripts: Object.fromEntries(models.map((m) => [m, JSON.parse(fs.readFileSync(path.join(TR, m, 'meta.json'), 'utf8'))])) };
if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify({ provenance, models, agg, clips: clipRows }, null, 1));
