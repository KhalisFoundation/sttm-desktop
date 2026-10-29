#!/usr/bin/env node
/* line-truth.js — line-level truth (per-line start/end + confidence) for every benchmark clip, made with
 * the forced aligner that produced the Renton rt11 truth (research/follower-bench emis.js + align.js).
 * Unattended and polite: each clip's model pass (emis.js) runs under the bench lock, only when no other
 * job is waiting. Text comes from the local BaniDB Realm: the clip's Bani (paath, Aarti, Renton paath
 * parts, Asa di Vaar) or its truth Shabad(s) in order (L2, Fremont, Renton kirtan parts).
 *
 *   node line-truth.js [--suites ...] [--tier smoke] [--only ...] [--keep-emis]
 * Output: <cache>/line-truth/truth/<clip id>.json (align.js format: lines[{i, verseId, text, start, end,
 * conf, check}], repeats, skippedInside) and <cache>/line-truth/summary.json with low-confidence counts
 * (check < 0.6 = listen before trusting). Sung kirtan repeats lines; the aligner allows going back 10
 * lines, but treat kirtan truth as provisional until spot-checked.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { SUITES, DS } = require('./vf-suites');
const { politeTurn, selectJobs } = require('./vf-check');
const { DEFAULT_ROOT } = require('./emis-cache');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const CACHE = path.resolve(arg('cache', process.env.VF_EMIS_CACHE || DEFAULT_ROOT));
const WORK = path.join(CACHE, 'line-truth');
const FB = path.resolve(__dirname, '../../follower-bench');
const MODEL = require('./speech-pack').speechModel().onnx;
const APP = path.join(os.homedir(), 'Library/Application Support/SikhiToTheMax');
const ROOT = path.resolve(__dirname, '../../..');

// text id: a Bani id, or 900000000 + n for a list of Shabads written as one text
function textFor(job) {
  const s = job.suite;
  if (s === 'paath') {
    const rows = JSON.parse(fs.readFileSync(path.join(DS, 'paath-tests.json')));
    return { bani: rows[Number(job.clip.slice(2)) - 1].bani_id };
  }
  if (s === 'aarti') return { bani: 22 };
  if (s === 'renton') return { rt11_rehras: { bani: 21 }, rt11_aarti: { bani: 22 }, rt11_sohila: { bani: 23 }, rt11_kirtan1: { shabads: [2053] }, rt11_fareed1: { shabads: [5299] }, rt11_fareed2: { shabads: [5238] }, rt11_hukamnama: { shabads: [3048] } }[job.clip];
  if (s === 'asa') return /asa|ytasa/.test(job.clip) || job.clip === 'nw11_session' ? { bani: 90 } : null;
  if (s === 'l2') {
    const rows = JSON.parse(fs.readFileSync(path.join(DS, 'human-fully-sheet.json')));
    const notes = JSON.parse(fs.readFileSync(path.join(DS, 'clip-notes.json')));
    const row = rows[Number(job.clip.slice(4)) - 1];
    return { shabads: [(notes[job.clip] || {}).truth_override || row.shabad_ids[0]] };
  }
  if (s === 'fremont') {
    const t = JSON.parse(fs.readFileSync(path.join(DS, 'khalis-tests.json'))).find((r) => r.name.startsWith(job.clip));
    return { shabads: t.shabads };
  }
  return null;
}

let realm = null;
function textJson(spec) {
  const Realm = require(path.join(ROOT, 'node_modules/realm'));
  const anvaad = require(path.join(ROOT, 'node_modules/anvaad-js'));
  if (!realm) {
    const sch = JSON.parse(fs.readFileSync(path.join(APP, 'realm-schema-evergreen.json')));
    realm = new Realm({ path: path.join(APP, 'sttmdesktop-evergreen-v2.realm'), schema: sch.schemas, schemaVersion: sch.schemaVersion, readOnly: true });
  }
  if (spec.bani != null) {
    const verses = [...realm.objects('Banis_Shabad').filtered('Bani.ID == $0', spec.bani).sorted('Seq')]
      .filter((r) => r.MangalPosition !== 'above')
      .map((r) => { const v = r.Custom || r.Verse; return v && { verseId: v.ID, unicode: anvaad.unicode(v.Gurmukhi || ''), header: r.header || 0 }; })
      .filter((v) => v && v.unicode);
    return { id: spec.bani, verses };
  }
  const verses = spec.shabads.flatMap((sid) => [...realm.objects('Verse').filtered('ANY Shabads.ShabadID == $0', sid).sorted('ID')]
    .map((v) => ({ verseId: v.ID, shabadId: sid, unicode: anvaad.unicode(v.Gurmukhi || ''), header: 0 })).filter((v) => v.unicode));
  return { id: 900000000 + Number(spec.shabads[0]), shabads: spec.shabads, verses };
}

(async () => {
  for (const d of ['cache', 'banis', 'truth']) fs.mkdirSync(path.join(WORK, d), { recursive: true });
  const suites = (arg('suites', Object.keys(SUITES).join(','))).split(',');
  const only = arg('only') ? new Set(arg('only').split(',')) : null;
  const jobs = selectJobs(suites, { only, sentinel: false });
  const sumFile = path.join(WORK, 'summary.json');
  const summary = fs.existsSync(sumFile) ? JSON.parse(fs.readFileSync(sumFile, 'utf8')) : {};
  for (const j of jobs) {
    const out = path.join(WORK, 'truth', `${j.id}.json`);
    if (fs.existsSync(out)) continue;
    const spec = textFor(j);
    if (!spec) { console.log(`${j.id}: no text truth for this clip, skipped`); continue; }
    const text = textJson(spec);
    fs.writeFileSync(path.join(WORK, 'banis', `${text.id}.json`), JSON.stringify(text));
    const emis = path.join(WORK, 'cache', `${j.id}.emis.f32`);
    // the wav name and the clip id match for every suite (cache id = wav basename)
    const wav = j.wav;
    const linked = path.join(WORK, 'cache', `${j.id}.wav`);
    if (!fs.existsSync(emis)) {
      await politeTurn();
      if (!fs.existsSync(linked)) fs.symlinkSync(wav, linked);
      const r = spawnSync('lockf', ['-k', '/tmp/vf-bench.lock', 'nice', '-n', '19', 'env', 'BENCH_THREADS=3', `MODEL_PATH=${MODEL}`, process.execPath, path.join(FB, 'emis.js'), linked], { cwd: WORK, encoding: 'utf8' });
      fs.rmSync(linked, { force: true });
      if (r.status) { console.log(`${j.id}: emis failed ${(r.stderr || '').slice(-300)}`); continue; }
    }
    const a = spawnSync('nice', ['-n', '19', process.execPath, path.join(FB, 'align.js'), j.id, String(text.id)], { cwd: WORK, encoding: 'utf8', maxBuffer: 1 << 26 });
    if (a.status) { console.log(`${j.id}: align failed ${(a.stderr || '').slice(-300)}`); continue; }
    const t = JSON.parse(fs.readFileSync(out, 'utf8'));
    const low = t.lines.filter((l) => l.check < 0.6).length;
    summary[j.id] = { suite: j.suite, text: spec, lines: t.lines.length, lowConfidence: low, repeats: t.repeats, skippedInside: t.skippedInside.length, at: new Date().toISOString() };
    fs.writeFileSync(sumFile, JSON.stringify(summary, null, 1));
    console.log(`${j.id}: ${t.lines.length} lines, ${low} low-confidence (check<0.6), ${t.repeats} repeats`);
    if (!argv.includes('--keep-emis')) fs.rmSync(emis, { force: true });
  }
  if (realm) realm.close();
})().catch((e) => { console.error(e.stack); process.exit(1); });
