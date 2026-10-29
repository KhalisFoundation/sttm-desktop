#!/usr/bin/env node
/* hearing-score.js — "hearing score": does the speech model HEAR the Gurbani, before any app logic? (results/HEARING.md)
 *
 * Input: results/hearing/transcripts/<model>/<clip>.jsonl from hearing-infer.py (the same 4 s windows, 1 s hop, for
 * every model) and the clip sample tools/hearing-sample.json. Per window with Shabad truth:
 *   hit@1 / hit@5   the app's own canonical retrieval (engine/retrieval/text-index.js TextIndex over the app's corpus
 *                   snapshot, as the search phase calls it) on the window's transcript: is the true Shabad the top
 *                   candidate / among the top 5 distinct Shabads? Copies of the same Gurbani count (bani-aware isRight,
 *                   COPIES=1, the GAB rule). The first-letter BaniDB route and the acoustic check are not simulated.
 *   usable          the transcript has >= 8 letters after the app's normalisation (the search phase's own minimum)
 *   pangti sim      only where line truth exists: the app's fuzz.partialRatio (0-100) between the transcript and the
 *                   true pangti(s) sung in the window (lines overlapping it by >= 1 s, in order); unusable windows = 0
 * App side (Karanbir int8 = the app's model): what the app SHOWED at the window end, from a GAB replay trace of the
 * upstream build (screen = shabad / seeking / verse events, as kirtan-score.js), and the app's own heard text there
 * (its last 'transcript' event: the 10 s recognizer window) run through the same retrieval.
 *
 *   node hearing-score.js [--models a,b,...] [--json out.json] [--md out.md]
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.COPIES = '1';
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const DS = path.join(__dirname, '..');
const ROOT = path.resolve(DS, '../..');
const ENGINE = path.join(ROOT, 'www/main/addons/voice-follow/engine');
const { TextIndex } = require(path.join(ENGINE, 'retrieval/text-index.js'));
const { partialRatio } = require(path.join(ENGINE, 'fuzz.js'));
const { sameGurbani } = require(path.join(ROOT, 'www/main/addons/voice-follow/components/switchPolicy.js'));
const { parseCsv } = require('./vf-manifest');

const TR = path.join(DS, 'results/hearing/transcripts');
const SAMPLE = JSON.parse(fs.readFileSync(arg('sample', path.join(__dirname, 'hearing-sample.json')), 'utf8')).clips;
const cdir = path.join(os.homedir(), 'personal/live-darbar-venues/cache/corpus');
const corpusFile = fs.readdirSync(cdir).filter((x) => x.endsWith('.json')).map((x) => path.join(cdir, x)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
const corpus = JSON.parse(fs.readFileSync(corpusFile, 'utf8'));
const idx = new TextIndex(corpus);
const verse = new Map(corpus.map((r) => [r.verseId, r]));
const corpusIdx = new Map(corpus.map((r, i) => [r.verseId, i]));
// Copies of the same Gurbani count as right (the GAB rule, bani-aware COPIES=1, with the app's own sameGurbani), from
// the corpus snapshot in memory (bani-aware's Realm query per Shabad is far too slow for ~6000 windows x 5 candidates).
const linesOf = new Map();
corpus.forEach((r) => (r.shabadIds || [r.shabadId]).forEach((s) => { if (!linesOf.has(s)) linesOf.set(s, []); linesOf.get(s).push(r.text); }));
const sameMemo = new Map();
const same = (a, b) => { const k = a < b ? `${a}:${b}` : `${b}:${a}`; if (!sameMemo.has(k)) sameMemo.set(k, sameGurbani(linesOf.get(a) || [], linesOf.get(b) || [])); return sameMemo.get(k); };
// isRight(shown, ok, lastVerse): shown = a Shabad id, or 'bani:<id>' (then the shown line's Shabad decides, as bani-aware)
function isRight(shown, ok, lastVerse) {
  if (ok.has(shown)) return true;
  if (typeof shown === 'number') return [...ok].some((o) => typeof o === 'number' && same(shown, o));
  if (typeof shown !== 'string' || !shown.startsWith('bani:') || lastVerse == null) return false;
  return ((verse.get(lastVerse) || {}).shabadIds || []).some((s) => isRight(s, ok));
}
const norm = (s) => (s || '').replace(/[\s।॥|0-9੦-੯.,;:!?-]+/g, ''); // = infer.norm / text-index norm
const MIN_LETTERS = 8;
const VOTE_S = 30;
const AKHAND_APP = path.join(DS, 'results/hearing/app-akhand');

const models = (arg('models', '') || fs.readdirSync(TR).filter((d) => fs.existsSync(path.join(TR, d, 'meta.json'))).join(','))
  .split(',').filter(Boolean);

// ---- truth ----
function truthOf(clip) {
  const rd = (f) => (fs.existsSync(path.join(clip.truth, f)) ? parseCsv(fs.readFileSync(path.join(clip.truth, f), 'utf8')) : []);
  const sh = rd('shabads.csv').filter((r) => r.start_s !== '' && r.end_s !== '')
    .map((r) => ({ ids: String(r.shabadId).split('|').map((x) => (/^bani:/.test(x) ? x : Number(x))), a: +r.start_s, b: +r.end_s }));
  if (clip.coldFirst && sh.length) { const first = sh.reduce((m, r) => (r.a < m.a ? r : m)); first.a = 0; }
  const ln = rd('lines.csv').filter((r) => r.start_s !== '' && r.end_s !== '').map((r) => ({ v: Number(r.verseId), a: +r.start_s, b: +r.end_s }))
    .sort((x, y) => x.a - y.a);
  return {
    shabad: (c) => { const s = new Set(); sh.forEach((r) => { if (r.a <= c && r.b >= c) r.ids.forEach((x) => s.add(x)); }); return s.size ? s : null; },
    lines: (a, b) => ln.filter((r) => Math.min(b, r.b) - Math.max(a, r.a) >= 1),
    hasLines: ln.length > 0,
  };
}

// ---- retrieval, memoised per text ----
const memo = new Map();
function topShabads(text) {
  if (memo.has(text)) return memo.get(text);
  const out = [];
  const seen = new Set();
  for (const c of idx.search(text, 60)) {
    if (seen.has(c.shabadId)) continue;
    seen.add(c.shabadId);
    out.push({ s: c.shabadId, v: c.verseId });
    if (out.length >= 5) break;
  }
  memo.set(text, out);
  return out;
}
const candRight = (c, ok) => isRight(c.s, ok) || ((verse.get(c.v) || {}).shabadIds || []).some((s) => ok.has(s));
function rankOf(text, ok) {
  if (norm(text).length < MIN_LETTERS) return -1; // the search phase never searches this little text
  const r = topShabads(text);
  for (let i = 0; i < r.length; i++) if (candRight(r[i], ok)) return i;
  return -1;
}

// ---- app trace: screen + heard text ----
function appTrace(clip) {
  let f = clip.appTrace;
  if (!f && clip.tier === 'akhand') f = path.join(AKHAND_APP, `${clip.id}.events.jsonl`);
  if (!f || !fs.existsSync(f)) return null;
  const ev = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const scr = ev.filter((e) => e.type === 'shabad' || e.type === 'seeking' || e.type === 'verse').map((e, i) => ({ ...e, i })).sort((a, b) => a.t - b.t || a.i - b.i);
  const st = []; let sid = null; let seeking = false; let v = null;
  for (const e of scr) {
    if (e.type === 'shabad') { sid = e.shabadId; v = e.verseId ?? v; } else if (e.type === 'verse') v = e.verseId; else seeking = !!e.visible;
    st.push({ t: e.t, s: seeking ? null : sid, v });
  }
  const tx = ev.filter((e) => e.type === 'transcript').sort((a, b) => a.t - b.t);
  const at = (arr, t) => { let lo = 0; let hi = arr.length - 1; let r = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m].t <= t) { r = arr[m]; lo = m + 1; } else hi = m - 1; } return r; };
  return { screen: (t) => at(st, t), heard: (t) => at(tx, t), file: f };
}

// ---- score ----
const pct = (a, n) => (n ? +(100 * a / n).toFixed(1) : null);
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return +(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2).toFixed(1); };
const mean = (xs) => (xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : null);
const perWindow = {}; // model -> clip -> [{t, ok, rank, usable, sim}]
const clipRows = [];
for (const clip of SAMPLE) {
  const T = truthOf(clip);
  const app = appTrace(clip);
  const row = { clip: clip.id, tier: clip.tier, windows: 0, models: {} };
  let appRight = 0; let appHeard5 = 0; let n = 0; let appHeardUsable = 0;
  const appWin = [];
  for (const m of models) {
    const f = path.join(TR, m, `${clip.id}.jsonl`);
    if (!fs.existsSync(f)) continue;
    const rows = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const W = [];
    for (const r of rows) {
      if (r.t < clip.start + 4 - 1e-6 || r.t > clip.end + 1e-6) continue;
      const ok = T.shabad(r.t - 2);
      if (!ok) continue;
      const usable = norm(r.text).length >= MIN_LETTERS;
      const rank = rankOf(r.text, ok);
      let sim = null; let truthText = null; let chance = null;
      if (T.hasLines) {
        const ls = T.lines(r.t - 4, r.t);
        if (ls.length) {
          truthText = ls.map((x) => (verse.get(x.v) || {}).text || '').join(' ');
          sim = usable ? partialRatio(norm(r.text), norm(truthText)) : 0;
          // chance level: the same transcript against the pangti(s) 997 verses further on in the corpus (another Shabad)
          if (usable) chance = partialRatio(norm(r.text), norm(ls.map((x) => (corpus[(corpusIdx.get(x.v) + 997) % corpus.length] || {}).text || '').join(' ')));
        }
      }
      const top1 = usable ? (topShabads(r.text)[0] || {}).s ?? null : null;
      W.push({ t: r.t, rank, usable, sim, chance, text: r.text, truthText, ok: [...ok], top1 });
    }
    // 30 s vote: the Shabad most often top-1 over the windows ending in (t-30, t] (>= 3 votes, a strict leader) is the
    // true one. A simple, logic-free use of the model's own hearing over time (no follower, no thresholds tuned).
    const tops = rows.filter((r) => r.t <= clip.end + 1e-6).map((r) => ({ t: r.t, s: norm(r.text).length >= MIN_LETTERS ? (topShabads(r.text)[0] || {}).s ?? null : null }));
    let j0 = 0;
    for (const w of W) {
      const cnt = new Map();
      while (j0 < tops.length && tops[j0].t <= w.t - VOTE_S) j0++;
      for (let j = j0; j < tops.length && tops[j].t <= w.t; j++) if (tops[j].s != null) cnt.set(tops[j].s, (cnt.get(tops[j].s) || 0) + 1);
      const sorted = [...cnt.entries()].sort((a, b) => b[1] - a[1]);
      w.vote = sorted.length && sorted[0][1] >= 3 && (sorted.length === 1 || sorted[0][1] > sorted[1][1]) ? sorted[0][0] : null;
      w.voteRight = w.vote != null && isRight(w.vote, new Set(w.ok));
      w.voteWrong = w.vote != null && !w.voteRight;
    }
    perWindow[m] = perWindow[m] || {};
    perWindow[m][clip.id] = W;
    const hit1 = W.filter((w) => w.rank === 0).length; const hit5 = W.filter((w) => w.rank >= 0).length;
    const sims = W.filter((w) => w.sim != null).map((w) => w.sim);
    row.models[m] = { n: W.length, hit1: pct(hit1, W.length), hit5: pct(hit5, W.length), usable: pct(W.filter((w) => w.usable).length, W.length), simMed: median(sims), simMean: mean(sims), simN: sims.length,
      vote: pct(W.filter((w) => w.voteRight).length, W.length), voteWrong: pct(W.filter((w) => w.voteWrong).length, W.length) };
    row.windows = Math.max(row.windows, W.length);
    if (m === 'karanbir-int8' && app) {
      for (const w of W) {
        const sc = app.screen(w.t);
        const right = !!(sc && sc.s != null && isRight(sc.s, new Set(w.ok), sc.v));
        const h = app.heard(w.t);
        const hr = h && h.t > w.t - 2 ? rankOf(h.text, new Set(w.ok)) : -1; // the app's own last 10 s decode, if fresh
        n++; if (right) appRight++; if (hr >= 0) appHeard5++; if (h && h.t > w.t - 2 && norm(h.text).length >= MIN_LETTERS) appHeardUsable++;
        appWin.push({ t: w.t, right, hit5: w.rank >= 0, appHit5: hr >= 0, vote: w.voteRight });
      }
    }
  }
  if (n) {
    const both = (p, q) => appWin.filter((w) => p(w) && q(w)).length;
    row.app = {
      trace: path.relative(DS, app.file).startsWith('..') ? app.file : path.relative(DS, app.file), n,
      shown: pct(appRight, n), appHeard5: pct(appHeard5, n), appHeardUsable: pct(appHeardUsable, n),
      heardNotShown: pct(both((w) => w.hit5, (w) => !w.right), n), shownNotHeard: pct(both((w) => !w.hit5, (w) => w.right), n),
      appHeardNotShown: pct(both((w) => w.appHit5, (w) => !w.right), n),
      voteNotShown: pct(both((w) => w.vote, (w) => !w.right), n), shownNoVote: pct(both((w) => !w.vote, (w) => w.right), n),
    };
  }
  clipRows.push(row);
}

// ---- aggregate per tier x model (window-weighted) ----
const tiers = ['main', 'hard', 'akhand'];
const agg = [];
for (const tier of tiers) {
  for (const m of models) {
    const W = SAMPLE.filter((c) => c.tier === tier).flatMap((c) => (perWindow[m] && perWindow[m][c.id]) || []);
    if (!W.length) continue;
    const sims = W.filter((w) => w.sim != null).map((w) => w.sim);
    agg.push({ tier, model: m, clips: SAMPLE.filter((c) => c.tier === tier && perWindow[m][c.id]).length, n: W.length,
      hit1: pct(W.filter((w) => w.rank === 0).length, W.length), hit5: pct(W.filter((w) => w.rank >= 0).length, W.length),
      usable: pct(W.filter((w) => w.usable).length, W.length), simMed: median(sims), simMean: mean(sims), simN: sims.length,
      simUsableMed: median(W.filter((w) => w.sim != null && w.usable).map((w) => w.sim)), simUsableN: W.filter((w) => w.sim != null && w.usable).length,
      simChanceMed: median(W.filter((w) => w.chance != null).map((w) => w.chance)),
      vote: pct(W.filter((w) => w.voteRight).length, W.length), voteWrong: pct(W.filter((w) => w.voteWrong).length, W.length) });
  }
  const A = clipRows.filter((r) => r.tier === tier && r.app);
  if (A.length) {
    const n = A.reduce((a, r) => a + r.app.n, 0);
    const w = (k) => +(A.reduce((a, r) => a + r.app[k] * r.app.n, 0) / n).toFixed(1);
    const kb = agg.find((x) => x.tier === tier && x.model === 'karanbir-int8');
    agg.push({ tier, model: 'APP (Karanbir int8, upstream 3fafc0ba)', clips: A.length, n, shown: w('shown'), appHeard5: w('appHeard5'), appHeardUsable: w('appHeardUsable'),
      heardNotShown: w('heardNotShown'), shownNotHeard: w('shownNotHeard'), appHeardNotShown: w('appHeardNotShown'), voteNotShown: w('voteNotShown'), shownNoVote: w('shownNoVote'),
      gap4s: kb && A.length === SAMPLE.filter((c) => c.tier === tier).length ? +(kb.hit5 - w('shown')).toFixed(1) : null });
  }
}

// ---- examples: per tier, the line-truth window where the models disagree most ----
const examples = [];
for (const tier of tiers) {
  let best = null;
  for (const c of SAMPLE.filter((x) => x.tier === tier && x.lineTruth)) {
    const ws = models.map((m) => (perWindow[m] && perWindow[m][c.id]) || []);
    if (ws.some((w) => !w.length)) continue;
    for (let i = 0; i < ws[0].length; i++) {
      const xs = ws.map((w) => w[i]).filter((w) => w && w.sim != null);
      if (xs.length !== models.length || xs.some((x) => x.t !== xs[0].t)) continue;
      const spread = Math.max(...xs.map((x) => x.sim)) - Math.min(...xs.map((x) => x.sim));
      if (!best || spread > best.spread) best = { tier, clip: c.id, t: xs[0].t, truth: xs[0].truthText, spread, by: Object.fromEntries(models.map((m, k) => [m, { text: xs[k].text, sim: xs[k].sim, rank: xs[k].rank }])) };
    }
  }
  if (best) examples.push(best);
}

// ---- output ----
const metaOf = (m) => { try { return JSON.parse(fs.readFileSync(path.join(TR, m, 'meta.json'), 'utf8')); } catch (_) { return {}; } };
const out = { createdAt: new Date().toISOString(), corpus: path.basename(corpusFile), models: Object.fromEntries(models.map((m) => [m, metaOf(m)])), agg, clips: clipRows, examples };
fs.writeFileSync(arg('json', path.join(DS, 'results/hearing/hearing-scores.json')), JSON.stringify(out, null, 1));
const L = [];
const TN = { main: 'Main GAB (mixer feed, control)', hard: 'GAB-Hard (Fremont hall, laptop mic)', akhand: 'GAB-Akhand Kirtan' };
L.push('| tier | model | clips | windows | Shabad hit@1 % | hit@5 % | usable % | 30 s vote right % (wrong %) | pangti sim median, all windows (mean; n) | pangti sim median, usable windows (n) | same windows vs a wrong pangti (chance) |', '|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of agg.filter((x) => x.hit5 != null)) L.push(`| ${TN[r.tier]} | ${r.model} | ${r.clips} | ${r.n} | ${r.hit1} | ${r.hit5} | ${r.usable} | ${r.vote} (${r.voteWrong}) | ${r.simN ? `${r.simMed} (${r.simMean}; ${r.simN})` : 'no line truth'} | ${r.simUsableN ? `${r.simUsableMed} (${r.simUsableN})` : '-'} | ${r.simChanceMed ?? '-'} |`);
L.push('', '| tier | app showed the true Shabad % (Y) | 30 s vote right % (X, Karanbir int8) | X - Y | vote right but app NOT showing it % | app showing it without a right vote % | 4 s hit@5 % | app\'s own 10 s text hit@5 % | windows |', '|---|---|---|---|---|---|---|---|---|');
for (const r of agg.filter((x) => x.shown != null)) {
  const kb = agg.find((x) => x.tier === r.tier && x.model === 'karanbir-int8');
  L.push(`| ${TN[r.tier]} | ${r.shown} | ${kb ? kb.vote : '-'} | ${kb ? (kb.vote - r.shown).toFixed(1) : '-'} | ${r.voteNotShown} | ${r.shownNoVote} | ${kb ? kb.hit5 : '-'} | ${r.appHeard5} | ${r.n} |`);
}
L.push('', '| clip | tier | windows | ' + models.map((m) => `${m} hit@5 / vote / sim`).join(' | ') + ' | app shown % | app 10 s heard hit@5 % |', '|---|---|---|' + models.map(() => '---|').join('') + '---|---|');
// per-clip cells: hit@5 / 30 s vote right / pangti sim median
for (const r of clipRows) L.push(`| ${r.clip.slice(0, 24)} | ${r.tier} | ${r.windows} | ${models.map((m) => (r.models[m] ? `${r.models[m].hit5} / ${r.models[m].vote} / ${r.models[m].simMed ?? '-'}` : '-')).join(' | ')} | ${r.app ? r.app.shown : '-'} | ${r.app ? r.app.appHeard5 : '-'} |`);
L.push('');
for (const e of examples) {
  L.push(`**${TN[e.tier]}: ${e.clip.slice(0, 28)} at ${(e.t - 4).toFixed(0)}-${e.t.toFixed(0)} s.** True pangti: ${e.truth}`, '');
  for (const m of models) L.push(`- ${m} (sim ${e.by[m].sim.toFixed(0)}, true Shabad ${e.by[m].rank >= 0 ? `rank ${e.by[m].rank + 1}` : 'not in top 5'}): ${e.by[m].text || '(nothing)'}`);
  L.push('');
}
fs.writeFileSync(arg('md', path.join(DS, 'results/hearing/hearing-scores.md')), L.join('\n'));
console.log(L.join('\n'));
