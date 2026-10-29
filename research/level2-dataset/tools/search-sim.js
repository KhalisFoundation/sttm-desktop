#!/usr/bin/env node
/* search-sim.js — offline what-if for the kirtan FIRST LOCK (search phase), from replay traces, no replay.
 * The full-text context route of VoiceFollow.jsx's search phase is re-run on the traced transcripts and the
 * traced search retrievals (4 candidates each), with the shipped rule and with candidate rules. Every search
 * episode in a trace (cold start, and each re-search after a release) is replayed until the app's own lock;
 * a rule's lock is the first decode it would lock on. Locks are scored against the truth (right if the
 * locked Shabad is the truth within [-10 s, +30 s], incl. copies and Bani membership).
 *
 *   node search-sim.js --dirs <suite dir>[,<suite dir>...] [--rules base,r1,...] [--clips]
 * Approximate: the first-letter and acoustic routes are not simulated (their locks are the app's own), copies
 * are not merged in the leader list (distinctLeaders), and the leaders are the traced top 3 of 4.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const DS = require('./gab-data').DS;
const ROOT = path.resolve(DS, '../..');
const { vfNorm } = (() => { try { return { vfNorm: require(path.join(ROOT, 'www/main/addons/voice-follow/engine/infer')).norm }; } catch (_) { return { vfNorm: (s) => (s || '').replace(/[^ਁ-੥ੰ-ੵ]/g, '') }; } })();
process.env.COPIES = '1';
const { isRight } = require('./bani-aware');

// ---- truth ----
const khalis = new Map(JSON.parse(fs.readFileSync(path.join(DS, 'khalis-tests.json'), 'utf8')).map((r) => [r.clip.replace(/\.wav$/, ''), r]));
const bench = process.env.VF_BENCHMARK || path.join(os.homedir(), 'personal/vf-benchmark');
const { parseCsv } = require('./vf-manifest');
const man = parseCsv(fs.readFileSync(path.join(bench, 'manifest.csv'), 'utf8'));
const byCache = new Map(man.map((r) => [r.cache_id || r.id, r]));
let baniMembers = null;
function inBani(sid, bani) {
  if (!baniMembers) {
    baniMembers = new Map();
    const Realm = require(path.join(ROOT, 'node_modules/realm'));
    const APP = path.join(os.homedir(), 'Library/Application Support/SikhiToTheMax');
    const sch = JSON.parse(fs.readFileSync(path.join(APP, 'realm-schema-evergreen.json')));
    const realm = new Realm({ path: path.join(APP, 'sttmdesktop-evergreen-v2.realm'), schema: sch.schemas, schemaVersion: sch.schemaVersion, readOnly: true });
    realm.objects('Banis_Shabad').forEach((r) => { const b = r.Bani && r.Bani.ID; const s = r.Shabad && r.Shabad.ShabadID; if (b == null || s == null) return; if (!baniMembers.has(b)) baniMembers.set(b, new Set()); baniMembers.get(b).add(s); });
    // not closed: Realm shares one handle per file in a process (bani-aware.js keeps using it)
  }
  return !!(baniMembers.get(bani) && baniMembers.get(bani).has(sid));
}
function truthOf(id) {
  const k = khalis.get(id);
  if (k) {
    const tl = k.timeline;
    return (t0, t1) => { const ids = new Set(); let last = null; for (const x of tl) { if (x.t <= t0) last = x.shabadId; else if (x.t <= t1) ids.add(x.shabadId); } if (last != null) ids.add(last); return ids.size ? ids : null; };
  }
  const row = byCache.get(id);
  if (!row) return null;
  const f = path.join(bench, row.content_folder, row.id, 'shabads.csv');
  if (!fs.existsSync(f)) return null;
  const rows = parseCsv(fs.readFileSync(f, 'utf8')).filter((s) => s.start_s !== '' && s.end_s !== '').map((s) => ({ ids: s.shabadId.split('|').map((x) => (/^bani:/.test(x) ? x : Number(x))), a: Number(s.start_s), b: Number(s.end_s) }));
  // bench-runner traces are in clip seconds (same as shabads.csv)
  return (t0, t1) => { const ids = new Set(); for (const r of rows) if (r.a <= t1 && r.b >= t0) r.ids.forEach((x) => ids.add(x)); return ids.size ? ids : null; };
}
function judge(truth, sid, t) {
  if (!truth) return 'unknown';
  const ok = truth(t - 10, t + 30);
  if (!ok) return 'unknown';
  if (isRight(sid, ok, null)) return 'right';
  for (const x of ok) if (typeof x === 'string' && x.startsWith('bani:') && inBani(sid, Number(x.slice(5)))) return 'right';
  return 'wrong';
}

// ---- rules ----
// c = tally entry {id,count,score,wins,anchor,verses}; ctx = {top, margin, winner, second, leaders, entries}
const RULES = {
  base: ({ top, margin, winner, second }) => winner && winner.id === top.shabadId && margin >= 0.08 && winner.count >= 6 && winner.wins >= 4 && (winner.anchor || winner.verses.size >= 2) && winner.score - (second ? second.score : 0) >= 1,
};
// candidate rules are added from --rule-file (module.exports = { name: fn })
if (arg('rule-file')) Object.assign(RULES, require(path.resolve(arg('rule-file'))));

function episodes(trace) {
  // search-phase decodes: a transcript followed by a 4-candidate text-retrieval before the next transcript
  const eps = []; let cur = null; let lastTr = null; let searching = true; let step = 0;
  for (const e of trace) {
    if (e.type === 'shabad') { if (cur) { cur.lockT = e.t; cur.lockId = e.shabadId; eps.push(cur); cur = null; } searching = false; continue; }
    if (e.type === 'seeking' && e.visible) { searching = true; continue; }
    if (!searching) continue;
    if (e.type === 'transcript') { step++; lastTr = { t: e.t, hyp: vfNorm(e.text), text: e.text, audioSec: e.audioSec, step }; if (!cur) cur = { t0: e.t, decodes: [] }; continue; }
    if (e.type === 'text-retrieval' && lastTr && (e.candidates || []).length <= 4 && (e.candidates || []).length >= 1 && cur) {
      if (cur.decodes.length && cur.decodes[cur.decodes.length - 1].step === lastTr.step) continue; // the FL route's own retrieval (3) after it
      if (e.candidates.length === 3 && cur.decodes.length && cur.decodes[cur.decodes.length - 1].step === lastTr.step) continue;
      cur.decodes.push({ t: lastTr.t, audioSec: lastTr.audioSec, step: lastTr.step, hyp: lastTr.hyp, text: lastTr.text, leaders: e.candidates.slice(0, 3) });
    }
  }
  if (cur) { cur.lockT = null; eps.push(cur); }
  return eps;
}

let TI = null;
function textIndex() {
  if (!TI) {
    const { TextIndex } = require(path.join(ROOT, 'www/main/addons/voice-follow/engine/retrieval/text-index.js'));
    const dir = path.join(os.homedir(), 'personal/live-darbar-venues/cache/corpus');
    const f = fs.readdirSync(dir).filter((x) => x.endsWith('.json')).map((x) => path.join(dir, x)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    TI = new TextIndex(JSON.parse(fs.readFileSync(f, 'utf8')));
  }
  return TI;
}
// acoustic helper for rules: CTC (the follower's scorer, as the app's search-phase acoustic route) of each
// Shabad's best line on the decode's own recognizer window, emissions from the replay cache
const AC = { clip: null, pcm: null, store: null, lines: null, sp: null, ctc: null };
function acousticFor(id) {
  if (AC.clip === id) return;
  const { windowKey, Store, storeDir } = require('./emis-cache');
  if (AC.store) AC.store.close();
  const wav = path.join(process.env.VF_CLIPS || path.join(os.homedir(), 'personal/live-darbar-venues/clips'), `${id}.wav`);
  const b = fs.readFileSync(fs.realpathSync(wav)); let off = 12; let pcm = null;
  while (off + 8 <= b.length) { const tag = b.toString('ascii', off, off + 4); const sz = b.readUInt32LE(off + 4); if (tag === 'data') { const n = Math.floor(sz / 2); pcm = new Float32Array(n); for (let i = 0; i < n; i++) pcm[i] = b.readInt16LE(off + 8 + i * 2) / 32768; break; } off += 8 + sz + (sz & 1); }
  AC.clip = id; AC.pcm = pcm; AC.key = windowKey;
  AC.store = new Store(storeDir({ model: require('./speech-pack').speechModel().onnx, clip: id }));
  if (!AC.lines) {
    textIndex();
    AC.lines = new Map(); for (const r of TI.rows) { if (!AC.lines.has(r.shabadId)) AC.lines.set(r.shabadId, []); AC.lines.get(r.shabadId).push(r.text); }
    AC.sp = require(path.join(ROOT, 'www/main/addons/voice-follow/engine/sentencepiece.js')).SP.load();
    AC.ctc = require(path.join(ROOT, 'www/main/addons/voice-follow/engine/follower.js')).Follower.prototype._ctcScore;
    AC.tok = new Map();
  }
}
function acScores(d, sids) {
  const end = Math.round(d.t * 16000);
  let emis = null;
  for (const L of [Math.round((d.audioSec || 10) * 16000), 160000]) { emis = AC.store.get(AC.key(AC.pcm.slice(Math.max(0, end - L), end))); if (emis) break; }
  if (!emis) return null;
  const tok = (l) => { if (!AC.tok.has(l)) AC.tok.set(l, AC.sp.encode(l.replace(/[।॥|0-9੦-੯.,;:!?-]+/g, ' ').replace(/\s+/g, ' ').trim())); return AC.tok.get(l); };
  return sids.map((sid) => Math.max(...(AC.lines.get(sid) || []).map((l) => { const y = tok(l); return y.length ? AC.ctc(emis, y, [0, emis.frames]) : -50; })));
}
function simulate(ep, rule0) {
  const rule = rule0.make ? rule0.make() : rule0;
  let entries = [];
  for (const d of ep.decodes) {
    if (d.hyp.length < 8) continue;
    const top = d.leaders[0];
    const margin = top ? top.score - (d.leaders[1] ? d.leaders[1].score : 0) : 0;
    entries = entries.filter((e) => d.step - e.step <= 24);
    if (top && !entries.some((e) => e.hyp === d.hyp)) entries.push({ step: d.step, hyp: d.hyp, candidates: d.leaders, anchor: top.score >= 0.8 && margin >= 0.2 });
    entries = entries.slice(-12);
    const tally = new Map();
    for (const e of entries) e.candidates.forEach((c, rank) => {
      if (c.score < 0.2) return;
      const acc = tally.get(c.shabadId) || { id: c.shabadId, count: 0, score: 0, wins: 0, anchor: false, verses: new Set(), verseHits: new Map() };
      acc.count += 1; acc.score += c.score;
      acc.verseHits.set(c.verseId, (acc.verseHits.get(c.verseId) || 0) + 1);
      if (rank === 0 && (!e.candidates[1] || e.candidates[0].score > e.candidates[1].score + 1e-9)) { acc.wins += 1; acc.verses.add(c.verseId); acc.anchor = acc.anchor || e.anchor; }
      tally.set(c.shabadId, acc);
    });
    const ranked = [...tally.values()].sort((a, b) => b.score - a.score);
    const ext = rule.wide ? () => textIndex().search(d.text, rule.wide) : null;
    const ac = rule.acoustic ? (sids) => acScores(d, sids) : null;
    const ctx = { top, margin, winner: ranked[0], second: ranked[1], leaders: d.leaders, entries, ranked, t: d.t, t0: ep.t0, step: d.step, hyp: d.hyp, ext, ac };
    if (top && rule(ctx)) return { t: d.t, id: rule.pick ? rule.pick(ctx) : top.shabadId };
  }
  return null;
}

const dirs = (arg('dirs') || '').split(',').filter(Boolean);
const rules = (arg('rules', Object.keys(RULES).join(','))).split(',');
const agg = {};
const lines = [];
for (const dir of dirs) {
  const suite = path.basename(dir);
  const td = path.join(dir, 'trace');
  for (const f of fs.readdirSync(td).filter((x) => x.endsWith('.events.jsonl'))) {
    const id = f.replace(/\.events\.jsonl$/, '');
    const trace = fs.readFileSync(path.join(td, f), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const truth = truthOf(id);
    if (rules.some((r) => RULES[r].acoustic || (RULES[r].make && RULES[r].acoustic))) acousticFor(id);
    for (const [k, ep] of episodes(trace).entries()) {
      const app = ep.lockT == null ? null : { t: ep.lockT, id: ep.lockId };
      for (const r of rules) {
        const sim = simulate(ep, RULES[r]);
        // the variant's lock: its own context lock if earlier than the app's (other routes stay), else the app's
        const lock = sim && (!app || sim.t < app.t) ? { ...sim, src: 'ctx' } : app ? { ...app, src: 'app' } : null;
        const verdict = lock ? judge(truth, lock.id, lock.t) : 'none';
        const a = (agg[`${suite}|${r}`] = agg[`${suite}|${r}`] || { eps: 0, locked: 0, right: 0, wrong: 0, unknown: 0, wait: 0, earlier: 0, wrongNew: [] });
        a.eps++;
        if (lock) { a.locked++; a[verdict]++; a.wait += lock.t - ep.t0; if (lock.src === 'ctx') a.earlier++; if (verdict === 'wrong' && lock.src === 'ctx') a.wrongNew.push(`${id.slice(0, 12)}#${k}@${lock.t.toFixed(0)}:${lock.id}`); } else a.wait += (trace[trace.length - 1].t - ep.t0);
        if (argv.includes('--clips')) lines.push(`${suite} ${id.slice(0, 14)} #${k} t0 ${ep.t0.toFixed(0)} ${r}: ${lock ? `${lock.src} ${lock.id}@${lock.t.toFixed(1)} (+${(lock.t - ep.t0).toFixed(1)}) ${verdict}` : 'no lock'}${app ? ` | app ${app.id}@${app.t.toFixed(1)}` : ''}${sim ? ` | sim ${sim.id}@${sim.t.toFixed(1)}` : ''}`);
      }
    }
  }
}
if (lines.length) console.log(lines.join('\n'));
console.log('| suite | rule | search episodes | locked | right | wrong | unknown | mean wait s | earlier than app | new wrong locks |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const [k, a] of Object.entries(agg).sort()) { const [s, r] = k.split('|'); console.log(`| ${s} | ${r} | ${a.eps} | ${a.locked} | ${a.right} | ${a.wrong} | ${a.unknown} | ${(a.wait / a.eps).toFixed(1)} | ${a.earlier} | ${a.wrongNew.join(' ')} |`); }
process.exit(0);
