#!/usr/bin/env node
/* sangat-score.js — the "sangat view": what the people in the hall actually see, scored the same way for
 * every suite. Library + CLI. One scorer for every bench output (vf-check traces, bench-runner / renton /
 * khalis / nw outputs), against the Voice-Follow benchmark truth (lines.csv + shabads.csv per clip).
 *
 * Line level (clips with line truth), time-weighted over the seconds a pangti is being sung/read (truth line
 * windows; aligned rows only with check >= 0.6, the dataset's rule). The screen is compared by NORMALISED
 * TEXT (Gurmukhi letters only: no vishraams, no ॥੧॥ numerals, punctuation or spaces), not by verse id, so
 * the same words under another Shabad / Bani id (Shabad 51 vs the Aarti Bani row, Sohila copy 2533,
 * So Dar 40 vs Asa 1368, Rehras header copies) count as the right pangti.
 *   ON          the pangti being sung/read is on screen
 *   CATCHING UP the previous pangti (true pangti started < 1.0 s ago) or the next one (it starts in < 1.0 s)
 *   BEHIND      the previous pangti for longer than that       AHEAD  the next pangti for longer than that
 *   LOST        same Shabad/Bani, 2+ pangtis away
 *   WRONG PAGE  text that is not in the current Shabad/Bani
 *   BLANK       nothing, or the Waheguru (seeking) slide
 * Headline: "sangat sees the right pangti" = ON + CATCHING UP, % of voiced time. Also: wrong-page seconds per
 * hour, catch-up lag (new pangti start -> first on screen while it is still being sung) p50/p90, longest
 * stretch not ON, episodes not ON > 3 s.
 * Shabad level (clips with only Shabad/Bani truth, e.g. Level-2 kirtan, Aarti-50, paath): ON = text of a
 * Shabad/Bani in a shabads.csv row covering that second is on screen; WRONG / BLANK as above; line level
 * "not available". Every result carries its truth provenance (human | aligned).
 *
 *   node sangat-score.js --run <bench output dir> [--dataset <benchmark root>] [--json <out.json>] [--md]
 *   node sangat-score.js --events <trace.jsonl | run.json> --clip <dataset id> [--dataset ...]
 *        [--window 26-121] [--explain [--samples 5] [--seed 1]]
 * --dataset: a local copy of khalisfoundation/GurbaniAutopilotBench (manifest.csv + <folder>/<id>/lines.csv,
 * shabads.csv); default $VF_BENCHMARK or ~/personal/vf-benchmark. Only the csv/meta files are read.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const STEP = 0.1;
const CATCH_S = 1.0;
const STUCK_S = 3.0;
const MIN_CHECK = 0.6;
const GAP_BREAK_S = 5;
const DS = path.join(__dirname, '..');
const ROOT = path.resolve(__dirname, '../../..');
const APP = path.join(os.homedir(), 'Library/Application Support/SikhiToTheMax');
const DEFAULT_DATASET = process.env.VF_BENCHMARK || path.join(os.homedir(), 'personal/vf-benchmark');
const BUCKETS = ['on', 'catching', 'behind', 'ahead', 'lost', 'wrong', 'blank'];
const r1 = (x) => (x == null ? null : +x.toFixed(1));

// Aligned truth in the aligner's own format, which keeps lines the dataset's lines.csv dropped (rows without an
// app verse id, e.g. "ਧਨਾਸਰੀ ਮਹਲਾ ੧ ਆਰਤੀ"): a text comparison can score those. Clip seconds.
const ALIGN_OVERRIDE = {
  rt11_rehras: 'results/rt11_rehrasX.app.truth.json',
  rt11_aarti: 'renton-oct11/truth/rt11_aarti.truth.json',
  rt11_sohila: 'renton-oct11/truth/rt11_sohila.truth.json',
  'ytasa1_4IXk2t_Irqo_900-1620': 'newton/truth/ytasa1.truth.json',
};

// ---------------------------------------------------------------- text --------------------
// Gurmukhi letters and vowel signs only (U+0A01-0A65, U+0A70-0A75: tippi, addak, ੴ); drops digits ੦-੯,
// dandas ॥ । , vishraam marks and anything else.
const norm = (s) => (s || '').replace(/[^ਁ-੥ੰ-ੵ]/g, '');
// Copies of one pangti in different Banis differ by a letter or a word ending (Sohila's Gagan mai thaal, Shabad 51:
// ਕਵਲ / ਨਾਇ / ਹਹਿ vs the Aarti Bani's ਕਮਲ / ਨਾਮਿ / ਹੈ): same pangti = edit distance <= 15% of the longer text.
const SAME_MAX = 0.15;
const sameMemo = new Map();
function lev(a, b) {
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
// Variant spellings of one salok in two places of the Granth (Shabad 2129 vs 4997: ਕਬੀਰਾ / ਕਬੀਰ, ਮੁਆ / ਮੂਆ,
// ਜਾਨੈ / ਜਾਨਿਆ) differ mostly in vowel signs: also same pangti when the consonant skeleton (vowel signs dropped,
// independent vowels as one letter) differs by <= 10% (skeleton >= 10 letters). Distinct Jaap Sahib lines stay ~30% apart.
const SKEL_MAX = 0.1;
const skel = (s) => s.replace(/[ਁ-ਃ਼-੍ੑੰੱੵ]/g, '').replace(/[ਅ-ਔੲੳ]/g, 'ਅ');
function same(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  // two texts that both appear in one Shabad / Bani (or one clip's truth) are different pangtis there
  // (Jaap Sahib's ਨਮਸਤੰ ਅਰੂਪੇ / ਨਮਸਤੰ ਅਨੂਪੇ, Sukhmani's ...ਧਨਵੰਤੇ / ...ਪਤਿਵੰਤੇ): near-matching is only for copies
  for (const u of unitCache.values()) if (u.pos.has(a) && u.pos.has(b)) return false;
  const k = a < b ? `${a}|${b}` : `${b}|${a}`;
  if (sameMemo.has(k)) return sameMemo.get(k);
  const L = Math.max(a.length, b.length);
  let ok = L >= 15 && Math.abs(a.length - b.length) <= SAME_MAX * L && lev(a, b) <= SAME_MAX * L; // short half-lines: exact only
  if (!ok) {
    const sa = skel(a);
    const sb = skel(b);
    const M = Math.max(sa.length, sb.length);
    ok = M >= 10 && Math.abs(sa.length - sb.length) <= SKEL_MAX * M && lev(sa, sb) <= SKEL_MAX * M;
  }
  sameMemo.set(k, ok);
  return ok;
}
// positions in a unit's text whose pangti is the same as s (memoised per unit)
function posIn(u, s) {
  if (u.pos.has(s)) return u.pos.get(s);
  if (!u.fuzzy) u.fuzzy = new Map();
  if (!u.fuzzy.has(s)) { const ps = []; u.seq.forEach((t, i) => { if (same(s, t)) ps.push(i); }); u.fuzzy.set(s, ps.length ? ps : null); }
  return u.fuzzy.get(s);
}

let realm = null;
let anvaad = null;
const verseText = new Map();
const unitCache = new Map();
function db() {
  if (realm) return realm;
  const Realm = require(path.join(ROOT, 'node_modules/realm'));
  anvaad = require(path.join(ROOT, 'node_modules/anvaad-js'));
  const sch = JSON.parse(fs.readFileSync(path.join(APP, 'realm-schema-evergreen.json'), 'utf8'));
  realm = new Realm({ path: path.join(APP, 'sttmdesktop-evergreen-v2.realm'), schema: sch.schemas, schemaVersion: sch.schemaVersion, readOnly: true });
  return realm;
}
function textOf(verseId) {
  if (verseId == null) return null;
  if (verseText.has(verseId)) return verseText.get(verseId);
  const r = db();
  const v = r.objectForPrimaryKey('Verse', Number(verseId)) || r.objectForPrimaryKey('Banis_Custom', Number(verseId));
  const u = v && v.Gurmukhi ? anvaad.unicode(v.Gurmukhi) : null;
  verseText.set(verseId, u);
  return u;
}
// a Shabad id or 'bani:N' -> { seq: [normalised text in reading order], pos: Map(text -> [index]) }
function unit(id) {
  const key = String(id);
  if (unitCache.has(key)) return unitCache.get(key);
  const r = db();
  let texts = [];
  if (key.startsWith('bani:')) {
    texts = [...r.objects('Banis_Shabad').filtered('Bani.ID == $0', Number(key.slice(5))).sorted('Seq')]
      .map((row) => (row.Custom || row.Verse) && anvaad.unicode((row.Custom || row.Verse).Gurmukhi || ''));
  } else {
    texts = [...r.objects('Verse').filtered('ANY Shabads.ShabadID == $0', Number(key)).sorted('ID')].map((v) => anvaad.unicode(v.Gurmukhi || ''));
  }
  const seq = texts.map(norm).filter(Boolean);
  const pos = new Map();
  seq.forEach((t, i) => { if (!pos.has(t)) pos.set(t, []); pos.get(t).push(i); });
  const u = { id: key, seq, pos };
  unitCache.set(key, u);
  return u;
}
function close() { if (realm) { realm.close(); realm = null; } }

// ---------------------------------------------------------------- truth -------------------
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const h = lines[0].split(',');
  return lines.slice(1).map((l) => { const c = l.split(','); return Object.fromEntries(h.map((k, i) => [k, c[i] ?? ''])); });
}
const numOrNull = (s) => (s === '' || s == null ? null : Number(s));

// manifest index: dataset id, cache id and every suite_jobs clip -> manifest row
function loadDataset(root = DEFAULT_DATASET) {
  const mf = path.join(root, 'manifest.csv');
  if (!fs.existsSync(mf)) return null;
  const { parseCsv: pc } = require('./vf-manifest');
  const rows = require('./vf-manifest').canonRows(pc(fs.readFileSync(mf, 'utf8')));
  const by = new Map();
  for (const r of rows) {
    by.set(r.id, r);
    if (r.cache_id) by.set(r.cache_id, r);
    for (const sj of (r.suite_jobs || '').split(';').filter(Boolean)) { by.set(sj, r); const c = sj.split(':')[1]; if (!by.has(c)) by.set(c, r); }
  }
  return { root, rows, by, find: (key, suite) => (suite && by.get(`${suite}:${key}`)) || by.get(key) || null };
}

// -> { id, folder, lines: [{text, norm, start, end, conf, verseId, scored}], linesSource, shabads: [{ids, start, end, source}], shabadSource }
function loadTruth(ds, row) {
  let dir = path.join(ds.root, row.content_folder, row.id);
  if (!fs.existsSync(dir) && row.folder_on_disk) dir = path.join(ds.root, row.folder_on_disk, row.id); // a copy with the old folder names
  const rd = (f) => (fs.existsSync(path.join(dir, f)) ? parseCsv(fs.readFileSync(path.join(dir, f), 'utf8')) : []);
  const sh = rd('shabads.csv').map((s) => ({ ids: s.shabadId.split('|').filter(Boolean), start: numOrNull(s.start_s), end: numOrNull(s.end_s), source: s.source }))
    .filter((s) => s.ids.length && s.start != null && s.end != null && s.end > s.start);
  // The user's spoken correction "the sung stretch ends earlier" (clip-notes.json end_override_s; clip12, clip17)
  // is not in the dataset's shabads.csv (v0.1): apply it here, as rescore.js does.
  const corrections = [];
  if (/^clip\d\d$/.test(row.id)) {
    const note = (JSON.parse(fs.readFileSync(path.join(DS, 'clip-notes.json'), 'utf8')))[row.id] || {};
    if (note.end_override_s) {
      const srow = JSON.parse(fs.readFileSync(path.join(DS, 'human-fully-sheet.json'), 'utf8'))[Number(row.id.slice(4)) - 1];
      const end = note.end_override_s - Math.max(0, srow.start_s - 30);
      for (const s of sh) s.end = Math.min(s.end, end);
      corrections.push(`clip-notes end_override_s: sung stretch ends at ${end} s`);
    }
  }
  let lines;
  let linesSource = row.lines_source && row.lines_source !== 'none' ? row.lines_source : null;
  let linesFrom = linesSource ? `${row.content_folder}/${row.id}/lines.csv` : null;
  const ov = ALIGN_OVERRIDE[row.id];
  if (ov && fs.existsSync(path.join(DS, ov))) {
    const t = JSON.parse(fs.readFileSync(path.join(DS, ov), 'utf8'));
    lines = t.lines.filter((l) => l.end > 0).map((l) => {
      const text = l.text && norm(l.text) ? l.text : textOf(l.appVerseId ?? l.verseId);
      const conf = l.check ?? null;
      return { text, norm: norm(text), start: l.start, end: l.end, conf, verseId: l.appVerseId ?? l.verseId, ids: [l.verseId, l.appVerseId].filter((x) => x != null).map(Number), scored: conf != null && conf >= MIN_CHECK };
    });
    linesSource = 'aligned';
    linesFrom = `research/level2-dataset/${ov}`;
  } else {
    lines = rd('lines.csv').map((l) => {
      const src = l.source || linesSource;
      const conf = numOrNull(l.confidence);
      const text = textOf(Number(l.verseId));
      return { text, norm: norm(text), start: Number(l.start_s), end: Number(l.end_s), conf, verseId: Number(l.verseId), ids: [Number(l.verseId)], src, scored: src === 'human' || (conf != null && conf >= MIN_CHECK) };
    });
  }
  const audit = applyEarChecks(ds, row, lines);
  lines = lines.filter((l) => l.norm && l.end > l.start).sort((a, b) => a.start - b.start);
  const shabadSource = [...new Set(sh.map((s) => s.source))].join('+') || null;
  return { id: row.id, folder: row.content_folder, lines, linesSource: lines.length ? linesSource : null, linesFrom, shabads: sh.filter((s) => s.end > s.start), shabadSource, provenance: row.truth_provenance, corrections, audit };
}

// Ear checks of aligned line starts (HF human-verdicts/line-start-check/verdicts.csv, mirrored in the local dataset
// copy; the lines.csv `source` column carries the same marks: aligned+human-confirmed / -unsure / REJECTED-by-human).
// A line whose start a person rejected is never scored. Returns { checked, confirmed, unsure, rejected } or null.
const verdictMemo = new Map();
function earChecks(ds) {
  if (verdictMemo.has(ds.root)) return verdictMemo.get(ds.root);
  const f = path.join(ds.root, 'human-verdicts', 'line-start-check', 'verdicts.csv');
  const v = fs.existsSync(f) ? parseCsv(fs.readFileSync(f, 'utf8')).map((r) => ({ rec: r.recording, ids: [r.verseId, r.appVerseId].filter(Boolean).map(Number), t: Number(r.claimed_start_s), verdict: r.verdict })) : [];
  verdictMemo.set(ds.root, v);
  return v;
}
function applyEarChecks(ds, row, lines) {
  const vs = earChecks(ds).filter((v) => v.rec === row.id);
  const a = { checked: 0, confirmed: 0, unsure: 0, rejected: 0 };
  for (const l of lines) {
    let verdict = /REJECTED/i.test(l.src || '') ? 'no' : /human-(confirmed|corrected)/.test(l.src || '') ? 'yes' : /human-unsure/.test(l.src || '') ? 'unsure' : null;
    const v = vs.find((x) => Math.abs(x.t - l.start) < 0.15 && x.ids.some((id) => (l.ids || []).includes(id)));
    if (v) verdict = v.verdict;
    if (!verdict) continue;
    a.checked++;
    if (verdict === 'yes') a.confirmed++;
    else if (verdict === 'no') { a.rejected++; l.scored = false; l.rejected = true; } else a.unsure++;
  }
  return a.checked ? a : null;
}

// ---------------------------------------------------------------- screen ------------------
// events -> state changes [{t, verse, shabad, blank}] (clip seconds). Before the first Shabad = blank.
function screenStates(events) {
  const ev = events.filter((e) => ['shabad', 'verse', 'seeking'].includes(e.type)).map((e, i) => ({ ...e, i })).sort((a, b) => a.t - b.t || a.i - b.i);
  const out = [{ t: -1e9, verse: null, shabad: null, seeking: false }];
  let cur = { verse: null, shabad: null, seeking: false };
  for (const e of ev) {
    if (e.type === 'shabad') cur = { ...cur, shabad: e.shabadId, verse: e.verseId ?? null };
    else if (e.type === 'verse') cur = { ...cur, verse: e.verseId };
    else if (e.type === 'seeking') cur = { ...cur, seeking: !!e.visible };
    out.push({ t: e.t, ...cur });
  }
  return out;
}
function stateAt(states, t) {
  let lo = 0;
  let hi = states.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (states[m].t <= t) lo = m; else hi = m - 1; }
  return states[lo];
}
// a bench output file -> { events (clip seconds), hasVerse }
function loadEvents(file) {
  if (file.endsWith('.jsonl')) {
    const events = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => ['shabad', 'verse', 'seeking'].includes(e.type));
    return { events, hasVerse: events.some((e) => e.verseId != null), dur: null };
  }
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  let events = j.events || [];
  // bench-runner.js writes t - lead (truth window start = 0); traces and renton/khalis/nw outputs are clip seconds
  const lead = j.row && j.row.start_s != null ? j.row.start_s - Math.max(0, j.row.start_s - 30) : 0;
  events = events.filter((e) => ['shabad', 'verse', 'seeking'].includes(e.type)).map((e) => ({ ...e, t: e.t + lead }));
  // a run over part of the clip (renton stress: Rehras 0-600 s) is scored only up to its end
  const dur = j.row ? null : Number(j.dur) || null;
  return { events, hasVerse: events.some((e) => e.verseId != null), dur };
}

// ---------------------------------------------------------------- scoring -----------------
function newAcc() { return { voiced: 0, b: Object.fromEntries(BUCKETS.map((k) => [k, 0])), lags: [], missed: 0, lines: 0, longest: 0, stuck: 0, excluded: 0 }; }
function stretchTracker(acc) {
  let cur = 0;
  let lastT = null;
  return {
    tick(t, on) {
      if (lastT != null && t - lastT > GAP_BREAK_S) this.flush();
      lastT = t;
      if (on) this.flush(); else cur += STEP;
    },
    flush() { if (cur > STUCK_S + 1e-9) acc.stuck++; acc.longest = Math.max(acc.longest, cur); cur = 0; },
  };
}
// screen state -> normalised text on screen (null = blank), or { unknownUnit } when only a Shabad id is known
function screenText(st) {
  if (st.seeking || st.shabad == null && st.verse == null) return null;
  if (st.verse != null) { const t = textOf(st.verse); return t ? norm(t) : { unknownUnit: st.shabad }; }
  return { unknownUnit: st.shabad };
}
const unitIdOfShown = (id) => (id == null ? null : String(id));
// fraction of a shown unit's texts that are in the accepted set (Shabad shown without a verse id)
function overlap(shownUnit, set) {
  if (shownUnit == null) return 0;
  const u = unit(unitIdOfShown(shownUnit));
  if (!u.seq.length) return 0;
  return u.seq.filter((t) => set.has(t) || [...set].some((x) => same(t, x))).length / u.seq.length;
}

// A Bani row also covers the windows of its member pieces (aa07: bani:22 from 30 s, its first piece 7596 from 0 s):
// piece order inside a sung Bani is not scored at Shabad level, only "a text of this Bani is up".
function covering(truth, t) {
  if (!truth.memberOf) {
    truth.memberOf = new Map();
    const banis = truth.shabads.filter((r) => r.ids.some((id) => String(id).startsWith('bani:')));
    for (const r of truth.shabads) {
      if (banis.includes(r)) continue;
      const m = banis.filter((b) => r.ids.some((id) => overlap(id, new Set(b.ids.flatMap((x) => unit(x).seq))) >= 0.5));
      if (m.length) truth.memberOf.set(r, m);
    }
  }
  const a = truth.shabads.filter((s) => s.start <= t && t < s.end);
  for (const r of [...a]) for (const b of truth.memberOf.get(r) || []) if (!a.includes(b)) a.push(b);
  return a;
}
function activeRows(truth, t) {
  const a = covering(truth, t);
  return a.length ? a : truth.shabads;
}

function scoreLines(truth, states, { trace, until = Infinity } = {}) {
  const acc = newAcc();
  // segments: consecutive truth rows with the same text are one pangti on screen (kirtan repeats a line)
  const segs = [];
  for (const l of truth.lines) {
    const last = segs[segs.length - 1];
    if (last && last.norm === l.norm && l.start - last.end < 2) { last.end = Math.max(last.end, l.end); last.rows.push(l); last.scored = last.scored || l.scored; } else segs.push({ norm: l.norm, text: l.text, start: l.start, end: l.end, rows: [l], scored: l.scored });
  }
  const truthSet = new Set(segs.map((s) => s.norm));
  const truthUnit = { id: `truth:${truth.id}`, seq: [...truthSet], pos: new Map([...truthSet].map((t, i) => [t, [i]])) };
  unitCache.set(truthUnit.id, truthUnit);
  for (const r of truth.shabads) r.ids.forEach(unit); // load the clip's units before any near-match is memoised
  const tr = stretchTracker(acc);
  segs.forEach((seg, k) => {
    if (seg.start >= until - 2) return; // the run ended before this pangti (as renton-score: start < dur - 2)
    if (!seg.scored) { acc.excluded += seg.end - seg.start; return; }
    acc.lines++;
    let lag = null;
    for (const row of seg.rows) {
      if (!row.scored) { acc.excluded += row.end - row.start; continue; }
      for (let t = Math.ceil(row.start / STEP) * STEP; t < Math.min(row.end, until); t += STEP) {
        const st = stateAt(states, t);
        const S = screenText(st);
        let b;
        if (S == null) b = 'blank';
        else if (same(S, seg.norm)) b = 'on';
        else {
          const units = activeRows(truth, t).flatMap((r) => r.ids).map(unit);
          if (typeof S === 'object') {
            const set = new Set([...truthSet, ...units.flatMap((u) => u.seq)]);
            b = overlap(S.unknownUnit, set) >= 0.5 ? 'lost' : 'wrong';
          } else {
            // one pangti off: the neighbour in the sung order, or the neighbour in the Shabad/Bani text
            let d = 0;
            if (k > 0 && same(S, segs[k - 1].norm)) d = -1;
            else if (k + 1 < segs.length && same(S, segs[k + 1].norm)) d = 1;
            else {
              for (const u of units) {
                const ps = posIn(u, S);
                const pt = posIn(u, seg.norm);
                if (!ps || !pt) continue;
                for (const a of ps) for (const c of pt) if (Math.abs(a - c) === 1) d = a < c ? -1 : 1;
                if (d) break;
              }
            }
            if (d < 0) b = t - seg.start < CATCH_S ? 'catching' : 'behind';
            else if (d > 0) {
              const nextStart = k + 1 < segs.length ? segs[k + 1].start : seg.end;
              b = nextStart - t < CATCH_S ? 'catching' : 'ahead';
            } else if (truthUnit && posIn(truthUnit, S) || units.some((u) => posIn(u, S))) b = 'lost';
            else b = 'wrong';
          }
        }
        acc.voiced += STEP;
        acc.b[b] += STEP;
        tr.tick(t, b === 'on');
        if (b === 'on' && lag == null) lag = Math.max(0, t - seg.start);
        if (trace) trace.push({ t, b, truth: seg.text, screen: st.seeking ? '(Waheguru slide)' : textOf(st.verse) || (st.shabad != null ? `(Shabad ${st.shabad}, no verse id)` : '(nothing)'), verse: st.verse, shabad: st.shabad });
      }
    }
    if (lag == null) acc.missed++; else acc.lags.push(lag);
  });
  tr.flush();
  return acc;
}

function scoreShabads(truth, states, { trace, until = Infinity } = {}) {
  const acc = newAcc();
  if (!truth.shabads.length) return null;
  for (const r of truth.shabads) r.ids.forEach(unit);
  const tr = stretchTracker(acc);
  const lo = Math.min(...truth.shabads.map((s) => s.start));
  const hi = Math.min(until, Math.max(...truth.shabads.map((s) => s.end)));
  for (let t = Math.ceil(lo / STEP) * STEP; t < hi; t += STEP) {
    const rows = covering(truth, t);
    if (!rows.length) continue;
    const units = rows.flatMap((r) => r.ids).map(unit);
    const set = new Set(units.flatMap((u) => u.seq));
    const st = stateAt(states, t);
    const S = screenText(st);
    let b;
    if (S == null) b = 'blank';
    else if (typeof S === 'object') b = overlap(S.unknownUnit, set) >= 0.5 ? 'on' : 'wrong';
    else b = set.has(S) || units.some((u) => posIn(u, S)) ? 'on' : 'wrong';
    acc.voiced += STEP;
    acc.b[b] += STEP;
    tr.tick(t, b === 'on');
    if (trace) trace.push({ t, b, truth: rows.map((r) => r.ids.join('|')).join(' + '), screen: st.seeking ? '(Waheguru slide)' : textOf(st.verse) || (st.shabad != null ? `(Shabad ${st.shabad}, no verse id)` : '(nothing)'), verse: st.verse, shabad: st.shabad });
  }
  tr.flush();
  // first second the right Shabad/Bani is up, from the start of the first truth window
  return acc;
}

const quant = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
function summarize(acc) {
  if (!acc || acc.voiced < STEP / 2) return null;
  const pct = (x) => +(100 * x / acc.voiced).toFixed(1);
  const s = {
    voiced_s: r1(acc.voiced),
    right_pct: pct(acc.b.on + acc.b.catching),
    ...Object.fromEntries(BUCKETS.map((k) => [`${k}_pct`, pct(acc.b[k])])),
    wrong_s_per_h: r1(acc.b.wrong / (acc.voiced / 3600)),
    lag_p50: quant(acc.lags, 0.5) == null ? null : +quant(acc.lags, 0.5).toFixed(2),
    lag_p90: quant(acc.lags, 0.9) == null ? null : +quant(acc.lags, 0.9).toFixed(2),
    lines: acc.lines, lines_missed: acc.missed,
    longest_not_on_s: r1(acc.longest), stuck_over_3s: acc.stuck, excluded_s: r1(acc.excluded),
  };
  return s;
}
function merge(accs) {
  const m = newAcc();
  for (const a of accs) {
    if (!a) continue;
    m.voiced += a.voiced; m.lags.push(...a.lags); m.missed += a.missed; m.lines += a.lines; m.longest = Math.max(m.longest, a.longest); m.stuck += a.stuck; m.excluded += a.excluded;
    for (const k of BUCKETS) m.b[k] += a.b[k];
  }
  return m;
}

// one clip: events file + manifest row -> { line, shabad } (each { provenance, acc, summary } or null + why)
function scoreClip(ds, row, eventsFile, opts = {}) {
  const truth = loadTruth(ds, row);
  const { events, hasVerse, dur } = loadEvents(eventsFile);
  const until = dur || Infinity;
  const states = screenStates(events);
  const out = { id: row.id, folder: row.content_folder, events: eventsFile, scored_until_s: dur, truth: { lines: truth.linesFrom, linesSource: truth.linesSource, shabadSource: truth.shabadSource, corrections: truth.corrections, audit: truth.audit } };
  // opts.blankIsScored (GAB): a run that never put anything on screen is scored at line level too (all blank = 0%),
  // instead of dropping out of the line average
  const neverShown = !events.some((e) => e.type === 'shabad' || e.type === 'verse');
  if (truth.lines.length && (hasVerse || (opts.blankIsScored && neverShown))) {
    const acc = scoreLines(truth, states, { ...opts, until });
    out.line = { provenance: truth.linesSource, acc, summary: summarize(acc) };
  } else out.line = { why: truth.lines.length ? 'line level not available (the run has no verse ids)' : 'line level not available (no line truth)' };
  const sacc = scoreShabads(truth, states, { until, ...(opts.shabadTrace ? { trace: opts.shabadTrace } : {}) });
  out.shabad = sacc ? { provenance: truth.shabadSource, acc: sacc, summary: summarize(sacc) } : { why: 'no Shabad windows with times' };
  return out;
}

// every events file in a bench output dir (vf-check side dir, suite dir, or a renton/kh/l2 result dir)
// -> [{ file, key, suite }]; a trace beats a run JSON for the same clip
function findOutputs(dir) {
  const found = new Map();
  const walk = (d, suite) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) { if (!f.name.startsWith('.')) walk(p, f.name === 'trace' ? suite : f.name); continue; }
      let m = f.name.match(/^(.+)\.events\.jsonl$/);
      if (m) { found.set(`${suite}|${m[1]}`, { file: p, key: m[1], suite, trace: true }); continue; }
      m = f.name.match(/^(.+)\.json$/);
      if (!m || /score|summary|results|report|plan|status|truth|arbiter/.test(f.name)) continue;
      let j;
      try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { continue; }
      if (!Array.isArray(j.events)) continue;
      const k = `${suite}|${m[1]}`;
      if (!found.has(k)) found.set(k, { file: p, key: m[1], suite, trace: false, part: j.part || j.name });
    }
  };
  walk(dir, path.basename(dir));
  return [...found.values()];
}
const SUITE_HINT = (s) => (['l2', 'paath', 'aarti', 'fremont', 'renton', 'asa'].includes(s) ? s : /^l2/.test(s) ? 'l2' : /^kh/.test(s) ? 'fremont' : /renton|stress/.test(s) ? 'renton' : /^pt/.test(s) ? 'paath' : null);

function scoreRun(dir, { dataset } = {}) {
  const ds = typeof dataset === 'object' && dataset ? dataset : loadDataset(dataset || DEFAULT_DATASET);
  if (!ds) throw new Error(`no benchmark dataset at ${dataset || DEFAULT_DATASET} (manifest.csv + lines.csv/shabads.csv; set --dataset or VF_BENCHMARK)`);
  const outs = findOutputs(dir);
  // a trace and a run JSON for the same clip: keep the trace
  const byClip = new Map();
  const skipped = [];
  for (const o of outs) {
    const suite = SUITE_HINT(o.suite);
    // trace keys are cache ids; bench-runner JSONs are clip names (clip05); khalis JSONs are kh01_<session>
    const row = ds.find(o.key, suite) || ds.find(o.key.split('_')[0], suite) || (o.part && ds.find(o.part, suite));
    if (!row) { skipped.push({ file: o.file, why: 'no benchmark clip for it' }); continue; }
    // one result per benchmark clip (pt35 is replayed by the paath and the aarti suites: same audio, same
    // component); a trace beats a run JSON, then the first suite in the clip's suite_jobs
    const k = row.id;
    const prev = byClip.get(k);
    const rank = (x) => (x.o.trace ? 0 : 10) + Math.max(0, (row.suite_jobs || '').split(';').findIndex((sj) => sj.startsWith(`${x.suite}:`)));
    if (!prev || rank({ o, suite }) < rank(prev)) byClip.set(k, { o, row, suite });
  }
  const clips = [];
  for (const { o, row, suite } of byClip.values()) {
    try { clips.push({ suite, ...scoreClip(ds, row, o.file) }); } catch (e) { skipped.push({ file: o.file, why: String(e.message).split('\n')[0] }); }
  }
  return { dir, dataset: ds.root, clips, skipped };
}

// group clips -> { key: { level, provenance, n, summary } }
function aggregate(clips, keyOf = (c) => c.folder) {
  const groups = new Map();
  for (const c of clips) {
    for (const level of ['line', 'shabad']) {
      const r = c[level];
      if (!r || !r.acc) continue;
      const k = `${keyOf(c)}|${level}|${r.provenance}`;
      if (!groups.has(k)) groups.set(k, { key: keyOf(c), level, provenance: r.provenance, ids: [], accs: [] });
      const g = groups.get(k);
      g.ids.push(c.id);
      g.accs.push(r.acc);
    }
  }
  return [...groups.values()].map((g) => ({ key: g.key, level: g.level, provenance: g.provenance, n: g.ids.length, ids: g.ids, summary: summarize(merge(g.accs)) }));
}

const HEAD = '| group | level | truth | clips | voiced | sangat sees right pangti | ON | catching up | behind | ahead | lost | wrong page | blank | wrong-page s/h | catch-up lag p50 / p90 s | lines missed | longest not-ON s | stuck >3 s |';
function row(name, level, prov, n, s) {
  if (!s) return `| ${name} | ${level} | ${prov} | ${n} | - | - |||||||||||`;
  const lv = level === 'line';
  return `| ${name} | ${level} | ${prov || '?'} | ${n} | ${(s.voiced_s / 60).toFixed(1)} min | **${s.right_pct}%** | ${s.on_pct}% | ${lv ? `${s.catching_pct}%` : '-'} | ${lv ? `${s.behind_pct}%` : '-'} | ${lv ? `${s.ahead_pct}%` : '-'} | ${lv ? `${s.lost_pct}%` : '-'} | ${s.wrong_pct}% | ${s.blank_pct}% | ${s.wrong_s_per_h} | ${lv ? `${s.lag_p50 ?? '-'} / ${s.lag_p90 ?? '-'}` : 'n/a'} | ${lv ? `${s.lines_missed}/${s.lines}` : '-'} | ${s.longest_not_on_s} | ${s.stuck_over_3s} |`;
}
function markdown(res, { perClip = true } = {}) {
  const out = [HEAD, `|${HEAD.split('|').slice(1, -1).map(() => '---').join('|')}|`];
  const ag = aggregate(res.clips).sort((a, b) => a.key.localeCompare(b.key) || a.level.localeCompare(b.level) || String(a.provenance).localeCompare(String(b.provenance)));
  for (const g of ag) out.push(row(`\`${g.key}\``, g.level, g.provenance, g.n, g.summary));
  if (perClip) {
    for (const c of [...res.clips].sort((a, b) => a.id.localeCompare(b.id))) {
      if (c.line && c.line.summary) out.push(row(c.id, 'line', c.line.provenance, 1, c.line.summary));
    }
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- CLI --------------------
if (require.main === module) {
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
  const flag = (n) => argv.includes(`--${n}`);
  const ds = loadDataset(arg('dataset', DEFAULT_DATASET));
  if (!ds) { console.error(`no benchmark dataset at ${arg('dataset', DEFAULT_DATASET)} (--dataset <root with manifest.csv> or VF_BENCHMARK)`); process.exit(2); }
  if (arg('run')) {
    const res = scoreRun(path.resolve(arg('run')), { dataset: ds });
    console.log(`# sangat view: ${res.dir}\ntruth ${res.dataset}; ${res.clips.length} clips scored\n`);
    console.log(markdown(res, { perClip: !flag('no-clips') }));
    for (const c of res.clips) if (c.line && c.line.why && c.truth.linesSource) console.log(`  ${c.id}: ${c.line.why}`);
    for (const s of res.skipped) console.log(`  skipped ${s.file}: ${s.why}`);
    if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify({ ...res, clips: res.clips.map(({ line, shabad, ...c }) => ({ ...c, line: line && { provenance: line.provenance, why: line.why, ...line.summary }, shabad: shabad && { provenance: shabad.provenance, why: shabad.why, ...shabad.summary } })) }, null, 1));
  } else if (arg('events')) {
    const row = ds.find(arg('clip'));
    if (!row) { console.error(`no clip ${arg('clip')} in ${ds.root}`); process.exit(2); }
    const trace = [];
    const shabadTrace = [];
    const r = scoreClip(ds, row, path.resolve(arg('events')), { trace, shabadTrace });
    console.log(JSON.stringify({ id: r.id, truth: r.truth, line: r.line.summary || r.line.why, shabad: r.shabad.summary || r.shabad.why }, null, 1));
    const tl = trace.length ? trace : shabadTrace;
    if (arg('window')) {
      const [a, b] = arg('window').split('-').map(Number);
      const w = Object.fromEntries(BUCKETS.map((k) => [k, 0]));
      for (const x of tl) if (x.t >= a && x.t < b) w[x.b] += STEP;
      console.log(`window ${a}-${b} s (${trace.length ? 'line' : 'Shabad'} level, voiced seconds): ${BUCKETS.map((k) => `${k} ${w[k].toFixed(1)}`).join(', ')}`);
    }
    if (flag('explain')) {
      let seed = Number(arg('seed', 1));
      const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
      for (const k of BUCKETS) {
        const xs = tl.filter((x) => x.b === k);
        if (!xs.length) continue;
        const pick = new Set();
        const n = Math.min(Number(arg('samples', 5)), xs.length);
        while (pick.size < n) pick.add(Math.floor(rnd() * xs.length));
        console.log(`\n${k.toUpperCase()} (${(xs.length * STEP).toFixed(1)} s)`);
        for (const i of [...pick].sort((p, q) => p - q)) { const x = xs[i]; console.log(`  t=${x.t.toFixed(1)}  truth: ${x.truth}\n           screen: ${x.screen}  [verse ${x.verse ?? '-'}, shabad ${x.shabad ?? '-'}]`); }
      }
    }
  } else {
    console.error('usage: sangat-score.js --run <dir> | --events <file> --clip <id>  [--dataset <root>]');
    process.exit(2);
  }
  close();
}

// vf-check: base vs candidate for the replayed jobs. jobs = [{ suite, clip, id }], traceOf(side, job) -> file.
// -> { lines: [markdown], groups: [...], clips: [...] }. Info only (never fails the check).
function compareSides(jobs, traceOf, { dataset } = {}) {
  const ds = typeof dataset === 'object' && dataset ? dataset : loadDataset(dataset || DEFAULT_DATASET);
  if (!ds) return { lines: [`(sangat view not scored: no benchmark truth at ${dataset || DEFAULT_DATASET}; set VF_BENCHMARK to a copy of khalisfoundation/GurbaniAutopilotBench)`], groups: [], clips: [] };
  const seen = new Set();
  const per = { base: [], cand: [] };
  for (const j of jobs) {
    const row = ds.find(j.id) || ds.find(j.clip, j.suite);
    if (!row || seen.has(row.id)) continue;
    const fb = traceOf('base', j);
    const fc = traceOf('cand', j);
    if (!fs.existsSync(fb) || !fs.existsSync(fc)) continue;
    seen.add(row.id);
    per.base.push({ suite: j.suite, ...scoreClip(ds, row, fb) });
    per.cand.push({ suite: j.suite, ...scoreClip(ds, row, fc) });
  }
  const keyOf = (c) => c.suite;
  const gb = aggregate(per.base, keyOf);
  const gc = new Map(aggregate(per.cand, keyOf).map((g) => [`${g.key}|${g.level}|${g.provenance}`, g]));
  const f = (s, k, suf = '') => (s && s[k] != null ? `${s[k]}${suf}` : '-');
  const lines = ['| suite / clip | level | truth | clips | sangat sees right pangti % base -> cand | wrong page s/h | catch-up lag p50 / p90 s | longest not-ON s | stuck >3 s |', '|---|---|---|---|---|---|---|---|---|'];
  const groups = [];
  const add = (name, level, prov, n, b, c) => {
    const lv = level === 'line';
    lines.push(`| ${name} | ${level} | ${prov || '?'} | ${n} | ${f(b, 'right_pct')} -> ${f(c, 'right_pct')} | ${f(b, 'wrong_s_per_h')} -> ${f(c, 'wrong_s_per_h')} | ${lv ? `${f(b, 'lag_p50')}/${f(b, 'lag_p90')} -> ${f(c, 'lag_p50')}/${f(c, 'lag_p90')}` : 'n/a'} | ${f(b, 'longest_not_on_s')} -> ${f(c, 'longest_not_on_s')} | ${f(b, 'stuck_over_3s')} -> ${f(c, 'stuck_over_3s')} |`);
    groups.push({ name, level, provenance: prov, n, base: b, cand: c });
  };
  for (const g of gb.sort((a, b) => a.key.localeCompare(b.key) || a.level.localeCompare(b.level))) {
    const c = gc.get(`${g.key}|${g.level}|${g.provenance}`);
    add(g.key, g.level, g.provenance, g.n, g.summary, c && c.summary);
  }
  per.base.forEach((cb, i) => {
    const cc = per.cand[i];
    if (cb.line && cb.line.summary) add(`  ${cb.suite}/${cb.id}`, 'line', cb.line.provenance, 1, cb.line.summary, cc.line && cc.line.summary);
  });
  const strip = (c) => ({ id: c.id, suite: c.suite, line: c.line && (c.line.summary ? { provenance: c.line.provenance, ...c.line.summary } : { why: c.line.why }), shabad: c.shabad && (c.shabad.summary ? { provenance: c.shabad.provenance, ...c.shabad.summary } : { why: c.shabad.why }) });
  return { lines, groups, clips: per.base.map((cb, i) => ({ base: strip(cb), cand: strip(per.cand[i]) })) };
}

// ---------------------------------------------------------------- find / switch events (GAB v1.1) -------------
// The Shabad/Bani windows of a clip (shabads.csv; a piece that belongs to a Bani row counts as that Bani) in order.
// The FIRST window is a find: from clip t=0 when the clip was cut from inside a performance (opts.coldFirst: the app
// is started while it is being sung, so the time it takes to show it is the cold-start find time), else from the
// window start (the Shabad begins inside the clip). Every LATER window whose Shabad/Bani differs from the one before
// it is a switch candidate, measured from its start. Each event: seconds until a text of it is on screen (null = never,
// inside its window). Windows shorter than 3 s are passing tuks, not events.
// Returns and parmaans (fixed Oct 14 2026, review of v1.1): a window whose Shabad/Bani was already sung earlier in the
// clip is a RETURN (back to the main Shabad after a parmaan). It is a switch only if the screen actually LEFT that
// Shabad (showed a different Shabad/Bani text) between its earlier window and the return; if the screen never left
// (a blank / Waheguru slide is not leaving), the event is kind 'stayed' (correct behaviour, never a 0 s switch).
// A window lying between two windows of the same Shabad/Bani, or inside a longer window of another one, is a
// parmaan: it is kept as an event with parmaan: true (GAB counts it as shown / not shown, apart from switches).
function findEvents(ds, row, eventsFile, opts = {}) {
  const truth = loadTruth(ds, row);
  const { events } = loadEvents(eventsFile);
  const states = screenStates(events);
  const rows = truth.shabads.filter((r) => r.end - r.start >= 3);
  if (!rows.length) return [];
  rows.forEach((r) => r.ids.forEach(unit));
  covering(truth, rows[0].start); // builds truth.memberOf
  const keyOf = (r) => { const m = truth.memberOf.get(r); return m && m.length ? m[0] : r; };
  // two truth rows of the same Shabad/Bani (e.g. sung again after a parmaan) are the same content: compare ids
  const kid = (r) => [...r.ids].map(String).sort().join('|');
  const sameKey = (a, b) => a === b || kid(a) === kid(b);
  const wins = [];
  for (const r of [...rows].sort((a, b) => a.start - b.start || b.end - a.end)) {
    const k = keyOf(r);
    const last = wins[wins.length - 1];
    if (last && sameKey(last.key, k) && r.start - last.end < 5) { last.end = Math.max(last.end, r.end); continue; }
    if (last && sameKey(last.key, k)) { wins.push({ key: k, start: r.start, end: r.end }); continue; }
    // a Bani row whose own window opens later than a member piece already seen: same content, extend
    if (wins.some((w) => sameKey(w.key, k) && w.end >= r.start - 5)) { const w = wins.filter((x) => sameKey(x.key, k)).pop(); w.end = Math.max(w.end, r.end); continue; }
    wins.push({ key: k, start: r.start, end: r.end });
  }
  const out = [];
  wins.forEach((w, i) => {
    const ids = [...new Set([...w.key.ids, ...rows.filter((r) => sameKey(keyOf(r), w.key)).flatMap((r) => r.ids)])];
    const units = ids.map(unit);
    const set = new Set(units.flatMap((u) => u.seq));
    const isOn = (st) => {
      const S = screenText(st);
      if (S == null) return false;
      if (typeof S === 'object') return overlap(S.unknownUnit, set) >= 0.5;
      return set.has(S) || units.some((u) => posIn(u, S));
    };
    let kind;
    let from;
    let parmaan = false;
    if (i === 0) { kind = opts.coldFirst || w.start <= 3 ? 'cold' : 'begins'; from = kind === 'cold' ? 0 : w.start; } else {
      if (sameKey(wins[i - 1].key, w.key)) return;
      kind = 'switch'; from = w.start;
      // parmaan: sandwiched between two windows of one other Shabad/Bani, or nested inside a window of another that goes on after it
      parmaan = wins.slice(0, i).some((a) => !sameKey(a.key, w.key) && (a.end > w.end + 3 || wins.slice(i + 1).some((b) => sameKey(b.key, a.key))));
      const prev = wins.slice(0, i).filter((a) => sameKey(a.key, w.key)).pop();
      if (prev) {
        // a return: did the screen show a different Shabad/Bani text between the earlier window and this one?
        const span = [stateAt(states, prev.end), ...states.filter((st) => st.t > prev.end && st.t <= from)];
        const shown = span.filter((st) => screenText(st) != null);
        const left = shown.some((st) => !isOn(st));
        const lastShown = shown[shown.length - 1];
        if (!left && lastShown && isOn(lastShown)) kind = 'stayed';
      }
    }
    let found = isOn(stateAt(states, from)) ? from : null;
    if (found == null) for (const st of states) if (st.t > from && st.t < w.end && isOn(st)) { found = st.t; break; }
    if (kind === 'stayed') { out.push({ kind, at: r1(from), window: [r1(w.start), r1(w.end)], unit: ids.join('|') }); return; }
    out.push({ kind, at: r1(from), window: [r1(w.start), r1(w.end)], unit: ids.join('|'), find: found == null ? null : r1(found - from), ...(parmaan ? { parmaan: true } : {}) });
  });
  return out;
}

module.exports = { findEvents, textOf, compareSides, same, norm, loadDataset, loadTruth, loadEvents, screenStates, scoreClip, scoreRun, aggregate, summarize, merge, markdown, row, HEAD, findOutputs, close, DEFAULT_DATASET, BUCKETS };
