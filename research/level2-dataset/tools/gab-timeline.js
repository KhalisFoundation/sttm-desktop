/* gab-timeline.js — the second-by-second view of one GAB run (the Space's timeline.html).
 *
 *   gab run writes <out>/timeline.json next to scorecard.json (from the replay's screen events, before they are
 *   deleted); gab publish uploads it as timeline/<slug>-<set>.json and adds it to timeline/index.json.
 *   By hand:  node gab-timeline.js <gab run --keep out dir> [--label "<name>"]   -> <out>/timeline.json
 *
 * Per clip and second, one category from GAB's own scorer (sangat-score.js, ten 0.1 s samples, majority; ties go to
 * the worse one):
 *   P right pangti (ON / CATCHING UP)        A right Shabad / Bani, other pangti     S right Shabad (no pangti key)
 *   W wrong Shabad on screen                 N nothing shown (blank or the Waheguru slide)       (none) no answer key
 * The pangti verdict comes from the line trace; otherwise the Shabad trace decides, so a clip's strip agrees with
 * its scorecard numbers (right-Shabad % and pangti % match the card).
 * Hover text: the full pangti (never cut), true and shown, from the STTM Desktop database; a Shabad is named by its
 * first pangti after the headers, a Bani by its name.
 *
 * Secondary number per clip (only on human pangti keys): Karanbir Singh's frame accuracy with a 1 s collar
 * ("Live Captioning for Gurbani Kirtan benchmark v1", eval.py, MIT): every whole second of the clip is a frame;
 * inside a pangti only that pangti counts; within 1 s of a pangti change the pangti before/after or a blank also
 * counts; in a pause between pangtis the pangti before/after or a blank counts; seconds before the first and after
 * the last pangti count as right. The shown pangti is matched to the answer pangtis by text (sangat-score `same`).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const LINE = { on: 'P', catching: 'P', behind: 'A', ahead: 'A', lost: 'A', wrong: 'W', blank: 'N' };
const SH = { on: 'S', wrong: 'W', blank: 'N' };
const RANK = { W: 5, N: 4, A: 3, S: 2, P: 1 };

function realmDb() {
  const ROOT = path.resolve(__dirname, '../../..');
  const Realm = require(path.join(ROOT, 'node_modules/realm'));
  const anvaad = require(path.join(ROOT, 'node_modules/anvaad-js'));
  const APP = path.join(os.homedir(), 'Library/Application Support/SikhiToTheMax');
  const sch = JSON.parse(fs.readFileSync(path.join(APP, 'realm-schema-evergreen.json'), 'utf8'));
  const realm = new Realm({ path: path.join(APP, 'sttmdesktop-evergreen-v2.realm'), schema: sch.schemas, schemaVersion: sch.schemaVersion, readOnly: true });
  return { realm, anvaad };
}

// events file of one clip in a replay side dir (vf-check layout: <side>/<suite>/trace/<job>.events.jsonl or <job>.json)
function eventsOf(sideDir, row) {
  for (const sj of (row.suite_jobs || '').split(';').filter(Boolean)) {
    const [suite, jid] = sj.split(':');
    for (const name of [jid, row.id, row.cache_id].filter(Boolean)) {
      for (const f of [path.join(sideDir, suite, 'trace', `${name}.events.jsonl`), path.join(sideDir, suite, `${name}.json`)]) if (fs.existsSync(f)) return f;
    }
  }
  return null;
}

// Karanbir's 1 s collar frame accuracy on GAB truth lines (human keys) and the screen states; null when not applicable
function collarAccuracy(sv, truth, states, dur) {
  const segs = truth.lines.filter((l) => l.scored).map((l) => ({ start: l.start, end: l.end, key: l.norm })).sort((a, b) => a.start - b.start);
  if (!segs.length) return null;
  const total = Math.floor(dur);
  const gtF = Array(total).fill(null);
  for (const s of segs) for (let t = Math.floor(s.start); t < Math.min(Math.floor(s.end), total); t++) gtF[t] = s.key;
  const ok = new Map();
  segs.forEach((s, i) => {
    const before = i > 0 ? segs[i - 1].key : null; const after = i + 1 < segs.length ? segs[i + 1].key : null;
    const a = Math.floor(s.start); const b = Math.floor(s.end);
    for (let t = Math.max(0, a - 1); t < a + 1; t++) ok.set(t, new Set([s.key, null, before].filter((x) => x !== undefined)));
    for (let t = Math.max(0, b - 1); t < b + 1; t++) ok.set(t, new Set([s.key, null, after].filter((x) => x !== undefined)));
  });
  for (let i = 0; i + 1 < segs.length; i++) for (let t = Math.floor(segs[i].end); t < Math.floor(segs[i + 1].start); t++) ok.set(t, new Set([segs[i].key, segs[i + 1].key, null]));
  const labels = [...new Set(segs.map((s) => s.key))];
  const memo = new Map();
  const predAt = (t) => {
    const st = sv_stateAt(states, t + 0.999);
    if (st.seeking || st.verse == null) return st.seeking || st.shabad == null ? null : '#other';
    if (memo.has(st.verse)) return memo.get(st.verse);
    const txt = sv.textOf(st.verse); const n = sv.norm(txt || '');
    const hit = n ? (labels.find((l) => l === n) || labels.find((l) => sv.same(l, n)) || '#other') : '#other';
    memo.set(st.verse, hit);
    return hit;
  };
  let right = 0;
  for (let t = 0; t < total; t++) {
    const g = gtF[t]; const p = predAt(t);
    if (g != null && p === g) right++;
    else if (ok.has(t)) { if (ok.get(t).has(p)) right++; } else if (g == null) right++;
  }
  return total ? +(100 * right / total).toFixed(1) : null;
}
function sv_stateAt(states, t) {
  let lo = 0; let hi = states.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (states[m].t <= t) lo = m; else hi = m - 1; }
  return states[lo];
}

// card: a GAB scorecard (its clips list); sideDir: <out>/replay/base. -> timeline JSON (or null when no events)
function build({ sv, ds, card, sideDir, label }) {
  const { realm, anvaad } = realmDb();
  const texts = []; const tIdx = new Map();
  const T = (s) => { if (s == null) return -1; if (!tIdx.has(s)) { tIdx.set(s, texts.length); texts.push(s); } return tIdx.get(s); };
  const verseMemo = new Map();
  const verse = (id) => {
    if (id == null) return null;
    if (!verseMemo.has(id)) { const v = realm.objectForPrimaryKey('Verse', Number(id)) || realm.objectForPrimaryKey('Banis_Custom', Number(id)); verseMemo.set(id, v && v.Gurmukhi ? anvaad.unicode(v.Gurmukhi) : null); }
    return verseMemo.get(id);
  };
  const unitMemo = new Map();
  const isHeader = (t) => /ੴ|ਮਹਲਾ|ਮਃ|^ਸਲੋਕ|^ਪਉੜੀ|^ਰਾਗੁ|^ਛੰਤ/.test(t) || t.replace(/[^਀-੿]/g, '').length < 14;
  const unitTitle = (id) => {
    const k = String(id);
    if (!unitMemo.has(k)) {
      let s;
      if (k.startsWith('bani:')) { const b = realm.objectForPrimaryKey('Banis', Number(k.slice(5))); s = b ? `Bani: ${anvaad.unicode(b.Gurmukhi)}` : `Bani ${k.slice(5)}`; } else {
        const v = [...realm.objects('Verse').filtered('ANY Shabads.ShabadID == $0', Number(k)).sorted('ID')];
        const first = v.find((x) => x.Gurmukhi && !isHeader(anvaad.unicode(x.Gurmukhi))) || v[0];
        s = first ? `Shabad: ${verse(first.ID)}` : `Shabad ${k}`;
      }
      unitMemo.set(k, s);
    }
    return unitMemo.get(k);
  };
  const shownText = (x) => (x.screen === '(Waheguru slide)' ? 'ਵਾਹਿਗੁਰੂ slide' : x.verse != null ? (verse(x.verse) || x.screen) : x.shabad != null ? unitTitle(x.shabad) : null);
  const maj = (arr) => { const n = {}; for (const c of arr) n[c] = (n[c] || 0) + 1; return Object.entries(n).sort((x, y) => y[1] - x[1] || RANK[y[0]] - RANK[x[0]])[0][0]; };
  const pick = (arr) => { const c = maj(arr.map((v) => v.c)); return arr.filter((v) => v.c === c).pop(); };

  const clips = [];
  for (const c of card.clips || []) {
    const row = ds.find(c.id) || ds.rows.find((r) => r.id === c.id);
    if (!row) continue;
    const ev = eventsOf(sideDir, row);
    if (!ev) continue;
    const trace = []; const shabadTrace = [];
    sv.scoreClip(ds, row, ev, { trace, shabadTrace, blankIsScored: true });
    const dur = Math.ceil(Number(row.duration_s) || 0);
    const L = new Map(); const Sh = new Map();
    const add = (m, t, v) => { const s = Math.floor(t + 1e-6); if (s < 0 || s >= dur) return; if (!m.has(s)) m.set(s, []); m.get(s).push(v); };
    for (const x of trace) add(L, x.t, { c: LINE[x.b], ti: T(x.truth), si: T(shownText(x)) });
    for (const x of shabadTrace) {
      const tt = String(x.truth).split(' + ').flatMap((p) => p.split('|')).map(unitTitle);
      add(Sh, x.t, { c: SH[x.b], ti: T([...new Set(tt)].join('  /  ')), si: T(shownText(x)) });
    }
    const cats = Array(dur).fill(null);
    for (let s = 0; s < dur; s++) {
      const l = L.has(s) ? pick(L.get(s)) : null;
      const h = Sh.has(s) ? pick(Sh.get(s)) : null;
      if (!l && !h) continue;
      let cat; let src;
      if (l && l.c === 'P') { cat = 'P'; src = l; } else if (h) { cat = h.c === 'S' ? (l ? 'A' : 'S') : h.c; src = l ? { ti: l.ti, si: h.si } : h; } else { cat = l.c; src = l; }
      cats[s] = [cat, src.ti, src.si];
    }
    const runs = [];
    for (let s = 0; s < dur; s++) {
      const k = cats[s] ? cats[s].join(',') : '';
      const last = runs[runs.length - 1];
      if (last && last.k === k && last.e === s) last.e = s + 1; else runs.push({ k, s, e: s + 1 });
    }
    const n = { P: 0, A: 0, S: 0, W: 0, N: 0 };
    for (const x of cats) if (x) n[x[0]]++;
    const basis = trace.length ? (c.pangti_basis || 'human') : null;
    let kb = null;
    if (basis === 'human') {
      const truth = sv.loadTruth(ds, row);
      const { events } = sv.loadEvents(ev);
      kb = collarAccuracy(sv, truth, sv.screenStates(events), dur);
    }
    let yt = null;
    const m = /youtu\.?be(?:\.com)?\/(?:watch\?v=)?([\w-]{11})/.exec(row.origin || '');
    const off = /_(\d+)-(\d+)$/.exec(row.cache_id || '');
    if (m && off) yt = { v: m[1], at: Number(off[1]) };
    clips.push({
      id: row.id, folder: row.content_folder, gurdwara: row.gurdwara || '', dur, basis, kb, yt, n,
      runs: runs.filter((r) => r.k).map((r) => { const [cat, ti, si] = r.k.split(','); return [r.s, r.e, cat, Number(ti), Number(si)]; }),
    });
  }
  realm.close();
  if (!clips.length) return null;
  clips.sort((a, b) => a.folder.localeCompare(b.folder) || a.id.localeCompare(b.id, undefined, { numeric: true }));
  return { gab: card.gab, label: label || null, commit: card.build && card.build.commit, set: card.set, split: card.split, clips, texts };
}

module.exports = { build, collarAccuracy };

if (require.main === module) {
  const out = process.argv[2];
  const li = process.argv.indexOf('--label');
  if (!out) { console.error('node gab-timeline.js <gab run --keep out dir> [--label "<name>"]'); process.exit(2); }
  const sv = require('./sangat-score');
  const card = JSON.parse(fs.readFileSync(path.join(out, 'scorecard.json'), 'utf8'));
  const ds = sv.loadDataset(process.env.VF_BENCHMARK || path.dirname(card.manifest.path));
  const tl = build({ sv, ds, card, sideDir: path.join(out, 'replay', 'base'), label: li > 0 ? process.argv[li + 1] : null });
  sv.close();
  if (!tl) { console.error('no replay events under', path.join(out, 'replay', 'base'), '(run gab with --keep)'); process.exit(1); }
  fs.writeFileSync(path.join(out, 'timeline.json'), JSON.stringify(tl));
  console.log(`timeline: ${tl.clips.length} clips -> ${path.join(out, 'timeline.json')}`);
}
