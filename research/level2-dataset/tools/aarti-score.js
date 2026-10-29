#!/usr/bin/env node
/* aarti-score.js <results dir> [more dirs...] — Aarti benchmark: finding and following Aarti from
 * many starting points. Truth: aarti-tests.json (every clip is Aarti throughout its truth window).
 *
 * Per clip, from the first audio sample (cold start = the lead-in) to the end:
 *   RIGHT  the screen shows the Aarti Bani, or an Aarti member shabad (any length), or a shabad
 *          whose text is a copy of one (Sohila's Gagan mai thaal), or Anand (r6/sep27 tails)
 *   WRONG  any other shabad
 *   NONE   nothing (searching / Waheguru slide)
 * found_s: seconds from the first audio sample until RIGHT first shows (the cold-start time).
 * Headline: RIGHT % over the scored window (truth start .. end), WRONG %, found within 30/60 s.
 * Where piece-level truth exists (r1aarti manifest, sep27 sheet rows) PIECE % = the shown shabad is
 * the piece being sung (or the Bani at a line of it) within +-TOL s.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const Realm = require(path.join(ROOT, 'node_modules/realm'));
const anvaad = require(path.join(ROOT, 'node_modules/anvaad-js'));
const { sameGurbani } = require(path.join(ROOT, 'www/main/addons/voice-follow/components/switchPolicy.js'));
const HERE = require('path').join(require('./gab-data').DS, 'aarti');
const TOL = 8;
const truth = JSON.parse(fs.readFileSync(path.join(HERE, 'aarti-tests.json')));
// Windows after Aarti has ended (paath-tests not_bani): not Aarti, never scored here.
const END_OVERRIDE = { 'sep27@434': 480 }; // kirtan (5393) begins ~8:00
const NOT_AARTI = new Set(["pt37", "pt42", "pt46"]);
const mem = JSON.parse(fs.readFileSync(path.join(HERE, 'bani-members.json')));
const AARTI = new Set(mem.members['22']);
const ANAND = new Set([...mem.members['1000'], ...mem.members['10'], 3375, 333375]);
const APP = path.join(process.env.HOME, 'Library/Application Support/SikhiToTheMax');
const sch = JSON.parse(fs.readFileSync(path.join(APP, 'realm-schema-evergreen.json')));
const realm = new Realm({ path: '/tmp/ab-bani.realm', schema: sch.schemas, schemaVersion: sch.schemaVersion, readOnly: true });
const linesCache = new Map();
const linesOf = (sid) => {
  if (!linesCache.has(sid)) linesCache.set(sid, realm.objects('Verse').filtered('ANY Shabads.ShabadID == $0', sid).map((v) => anvaad.unicode(v.Gurmukhi)));
  return linesCache.get(sid);
};
const verseShabads = new Map();
const shabadsOfVerse = (vid) => {
  if (!verseShabads.has(vid)) { const v = realm.objects('Verse').filtered('ID == $0', vid)[0]; verseShabads.set(vid, v ? v.Shabads.map((s) => s.ShabadID) : []); }
  return verseShabads.get(vid);
};
const copyCache = new Map();
const isCopyOfAarti = (sid) => {
  if (!copyCache.has(sid)) { const mine = linesOf(sid); copyCache.set(sid, [...AARTI].some((m) => m !== sid && sameGurbani(mine, linesOf(m)))); }
  return copyCache.get(sid);
};
// piece-level truth (recording time -> piece shabad)
const r1 = JSON.parse(fs.readFileSync(path.join(HERE, 'renton-manifests/manifest-r1a.json'))).segments.map((s) => ({ a: s.start, b: s.end, sid: Number(s.shabadId) }));
r1.push({ a: 328, b: 375, sid: null }, { a: 375, b: 450, sid: 4967 });
const r6 = JSON.parse(fs.readFileSync(path.join(HERE, 'renton-manifests/manifest-r6.json'))).segments.map((s) => ({ a: s.start, b: s.end, sid: Number(s.shabadId) }));
let sep27 = [];
try {
  const sh = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'ab-81-86c-truth.json')));
  sep27 = sh;
} catch (_) { sep27 = [{ a: 14, b: 103, sid: 7596 }, { a: 108, b: 141, sid: 8875 }, { a: 141, b: 162, sid: 8095 }]; }
const PIECES = { r1aarti: r1, r6aarti: r6, sep27 };

const cls = (sid, vid) => {
  if (sid == null) return 'NONE';
  if (typeof sid === 'string' && sid.startsWith('bani:')) { const b = Number(sid.slice(5)); return b === 22 ? 'RIGHT' : (b === 1000 || b === 10) ? 'RIGHT' : 'WRONG'; }
  if (AARTI.has(sid) || ANAND.has(sid)) return 'RIGHT';
  return isCopyOfAarti(sid) ? 'RIGHT' : 'WRONG';
};
const pieceOk = (sid, vid, pieces, tRec) => {
  const near = pieces.filter((p) => p.a - TOL <= tRec && tRec < p.b + TOL && p.sid).map((p) => p.sid);
  if (!near.length) return null;
  if (typeof sid === 'string' && sid.startsWith('bani:')) { const ss = vid != null ? shabadsOfVerse(vid) : []; return ss.some((s) => near.includes(s)); }
  if (near.includes(sid)) return true;
  return near.some((n) => sameGurbani(linesOf(sid), linesOf(n)));
};

const verseText = new Map();
const textOf = (vid) => {
  if (!verseText.has(vid)) { const v = realm.objects('Verse').filtered('ID == $0', vid)[0]; verseText.set(vid, v ? anvaad.unicode(v.Gurmukhi).replace(/[॥।੦-੯0-9]/g, ' ').replace(/\s+/g, ' ').trim() : ''); }
  return verseText.get(vid);
};
function scoreClip(row, file) {
  const j = JSON.parse(fs.readFileSync(file));
  // heard words per second (from the recognizer transcripts), for the line check
  const heard = new Map();
  j.events.filter((e) => e.type === 'transcript' && e.text).forEach((e) => { const sec = Math.floor(e.t); const set = heard.get(sec) || new Set(); e.text.split(/\s+/).filter((w) => w.length >= 3).forEach((w) => set.add(w)); heard.set(sec, set); });
  const wordsNear = (t) => { const w = new Set(); for (let k = t - 6; k <= t + 6; k += 1) (heard.get(k) || []).forEach((x) => w.add(x)); return w; };
  const lead = row.start_s - Math.max(0, row.start_s - 30);
  const ev = j.events.filter((e) => e.type === 'shabad' || e.type === 'verse' || e.type === 'seeking').sort((a, b) => a.t - b.t);
  const t0 = -lead; const t1 = row.end_s - row.start_s;
  const acc = { RIGHT: 0, WRONG: 0, NONE: 0 }; let piece = 0, pieceN = 0; let lineN = 0, lineOk = 0;
  let sid = null, vid = null, seeking = false, i = 0, found = null, wrongSw = 0, lastWrong = null, longestWrong = 0, run = 0;
  const shown = [];
  for (let t = t0; t < t1; t += 1) {
    while (i < ev.length && ev[i].t <= t + 0.5) { const e = ev[i++]; if (e.type === 'shabad') { sid = e.shabadId; if (e.verseId != null) vid = e.verseId; if (shown[shown.length - 1] !== sid) shown.push(sid); } if (e.type === 'verse') vid = e.verseId; if (e.type === 'seeking') seeking = !!e.visible; }
    const s = seeking ? null : sid;
    let c = cls(s, vid);
    // A piece the recording's own truth says is being sung is right even when the database
    // does not list it under the Aarti Bani (Renton's Phunhe M5 4967, the Jaap passage).
    if (c === 'WRONG' && PIECES[row.video_id] && pieceOk(s, vid, PIECES[row.video_id], row.start_s + t) === true) c = 'RIGHT';
    if (c === 'RIGHT' && found == null) found = t - t0;
    if (t < 0) continue; // lead-in: counts for found_s only
    acc[c] += 1;
    if (c === 'WRONG') { run += 1; longestWrong = Math.max(longestWrong, run); if (lastWrong !== s) { wrongSw += 1; lastWrong = s; } } else { run = 0; lastWrong = null; }
    // Line check: only on seconds with enough heard words; the shown line (or its neighbours
    // in the same shabad/Bani are not known here, so the shown line alone) must contain 2+ of them.
    if (s != null && vid != null) { const w = wordsNear(t); if (w.size >= 4) { lineN += 1; const txt = textOf(vid); let n = 0; w.forEach((x) => { if (txt.includes(x)) n += 1; }); if (n >= 2) lineOk += 1; } }
    const pieces = PIECES[row.video_id];
    if (pieces && s != null) { const ok = pieceOk(s, vid, pieces, row.start_s + t); if (ok != null) { pieceN += 1; if (ok) piece += 1; } }
  }
  const len = t1;
  return { clip: row.src + '@' + row.offset, len, right: +(100 * acc.RIGHT / len).toFixed(1), wrong: +(100 * acc.WRONG / len).toFixed(1), none: +(100 * acc.NONE / len).toFixed(1),
    piece: pieceN ? +(100 * piece / pieceN).toFixed(1) : null, lineHeard: lineN ? +(100 * lineOk / lineN).toFixed(1) : null, lineN, found_s: found, wrongSw, longestWrong, shown: shown.slice(0, 8).join(' > ') };
}

const dirs = process.argv.slice(2);
for (const d of dirs) {
  const rows = [];
  truth.forEach((row, k) => { if (NOT_AARTI.has(row.src) || (row.src === "sep27" && row.offset >= 494)) return; if (END_OVERRIDE[`${row.src}@${row.offset}`]) row = { ...row, end_s: END_OVERRIDE[`${row.src}@${row.offset}`] }; const f = path.join(d, `aa${String(k + 1).padStart(2, '0')}.json`); if (fs.existsSync(f)) rows.push(scoreClip(row, f)); });
  if (!rows.length) { console.log(`${d}: no results`); continue; }
  const tw = (key) => { let a = 0, b = 0; rows.forEach((r) => { a += r[key] * r.len / 100; b += r.len; }); return +(100 * a / b).toFixed(1); };
  const found = rows.filter((r) => r.found_s != null);
  const within = (s) => rows.filter((r) => r.found_s != null && r.found_s <= s).length;
  const pieceRows = rows.filter((r) => r.piece != null);
  const pw = (() => { let a = 0, b = 0; pieceRows.forEach((r) => { a += r.piece * r.len; b += r.len; }); return b ? +(a / b).toFixed(1) : null; })();
  const lw = (rs) => { let a = 0, b = 0; rs.forEach((r) => { if (r.lineHeard != null) { a += r.lineHeard * r.lineN; b += r.lineN; } }); return b ? +(a / b).toFixed(1) : null; };
  console.log(`\n### ${path.basename(d)}  (${rows.length} clips, ${(rows.reduce((s, r) => s + r.len, 0) / 60).toFixed(0)} min)`);
  console.log(`RIGHT (Aarti text up) ${tw('right')}% | WRONG ${tw('wrong')}% | NONE ${tw('none')}% | piece-exact ${pw}% | heard-line ${lw(rows)}% | found ${found.length}/${rows.length}, within 30 s ${within(30)}, within 60 s ${within(60)}, median ${found.length ? found.map((r) => r.found_s).sort((a, b) => a - b)[Math.floor(found.length / 2)] : '-'} s | wrong switches ${rows.reduce((s, r) => s + r.wrongSw, 0)} | longest wrong ${Math.max(...rows.map((r) => r.longestWrong))} s`);
  // per source
  const bySrc = {};
  rows.forEach((r) => { const k = r.clip.replace(/@.*/, '').replace(/^pt\d+$/, 'youtube'); (bySrc[k] ||= []).push(r); });
  Object.entries(bySrc).forEach(([k, rs]) => { let a = 0, w = 0, b = 0; rs.forEach((r) => { a += r.right * r.len; w += r.wrong * r.len; b += r.len; }); const f = rs.filter((r) => r.found_s != null); console.log(`  ${k.padEnd(8)} right ${(a / b).toFixed(1)}%  wrong ${(w / b).toFixed(1)}%  heard-line ${lw(rs)}%  found ${f.length}/${rs.length}  median find ${f.length ? f.map((r) => r.found_s).sort((x, y) => x - y)[Math.floor(f.length / 2)] : '-'} s`); });
  if (process.argv.includes('--clips')) rows.forEach((r) => console.log(`  ${r.clip.padEnd(14)} right ${String(r.right).padStart(5)}% wrong ${String(r.wrong).padStart(5)}% none ${String(r.none).padStart(5)}% piece ${r.piece == null ? '  - ' : String(r.piece).padStart(5) + '%'} line ${r.lineHeard == null ? '  - ' : String(r.lineHeard).padStart(5) + '%'} found ${r.found_s == null ? 'never' : r.found_s + 's'} | ${r.shown}`));
}
realm.close();
