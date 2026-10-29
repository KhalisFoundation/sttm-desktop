#!/usr/bin/env node
/* gab-add-sheet-rows.js — add the human-verified main-tab rows of the Level-2 Google Sheet that GAB did not have
 * (Oct 14 2026): Renton Finds (81, full Renton darbars, Sep 25 reviewer), Gurdwara Yuba City (17 with audio; the
 * 18th row, pDMz6_zhhDI, has no audio cut), and the Level-3 smagam rows (32: AKJ Toronto 2022 Fri/Sat, Manchester
 * 2024 Rehnsabhai) -> GAB-Akhand Kirtan tier. The clips are Cycle 10's cuts (<prefix>NN_<video>_<start-30>-<end+10>.wav,
 * suites rfinds / yuba / l3 in vf-suites.js).
 *
 *   node gab-add-sheet-rows.js [--out ~/personal/vf-benchmark] [--dry-run] [--x86 rn,yuba,l3clip] [--azure] [--hf]
 *
 * Writes <out>/1-kirtan-shabad/<id>/ (Akhand Kirtan smagams: <out>/5-akhand-kirtan/<id>/){audio.wav (APFS clone of the clip), shabads.csv, lines.csv (header only: no line
 * truth), meta.json} and APPENDS the rows to <out>/manifest.csv (existing rows are never changed; a re-run replaces
 * only its own rows); --hf also appends them to the manifest on Hugging Face (downloaded, never overwritten) and
 * uploads the clip folders. Truth per clip (Shabad level, human): the clip's own sheet row, plus the part of the previous
 * main-tab row of the same recording that falls in the 30 s lead-in (so a Shabad change inside the clip is a real
 * switch); rows after the clip's own row are left unlabelled (the 10 s tail is too short to judge a switch).
 * Ear-check corrections from clip-notes.json are applied: also_correct (more ids that count as right), end_override_s
 * (the sung stretch ends earlier), exclude (a stretch with no kirtan is cut out of the row). Sheet boundaries are a
 * few seconds approximate (verified-data-home).
 * Splits: Cycle 10's per recording (splits-cycle10.json): Renton Finds train/dev/test by recording (zuCiaw0exFA test);
 * Yuba City = Cycle 10's unseen-venue TEST (kept test); Level 3: Toronto Saturday = test, Friday + Manchester = train.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { SUITES, DS } = require('./vf-suites');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const flag = (n) => argv.includes(`--${n}`);
const OUT = path.resolve(arg('out', path.join(process.env.HOME, 'personal/vf-benchmark')).replace(/^~/, process.env.HOME));
const X86 = (arg('x86', 'rn,yuba,l3clip')).split(',').filter(Boolean); // id prefixes whose cache was recorded on x86
const J = (f) => JSON.parse(fs.readFileSync(path.join(DS, f), 'utf8'));
const r2 = (x) => Math.round(x * 100) / 100;
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = (header, rows) => [header, ...rows.map((r) => header.split(',').map((h) => csvCell(r[h])).join(','))].join('\n') + '\n';
const notes = J('clip-notes.json');
const splits = J('splits-cycle10.json');
const recSplit = new Map(splits.recordings.map((r) => [r.vid, r.split]));
const SHEET = 'Google Sheet "Level 2 Kirtan Live Darbar Dataset Real", main tab "Human-Fully Sheet (100% Human Verified) - Level 2" (human source of record)';
const X86_NOTE = 'cache: recorded on x86 (GCP vf-record n2-standard-32, linux-x64), not the Mac; never mix Mac windows into it';

const GROUPS = [
  { suite: 'rfinds', file: 'renton-finds-truth.json', prefix: 'rn', venue: 'Renton', split: (r) => r.split || recSplit.get(r.video_id),
    provenance: (k, r) => `${SHEET}; Renton Finds row (renton-finds-truth.json row ${k + 1} = research/level2-dataset/cycle10/renton-new-truth.json, Cycle 10); human: ${r.human}`,
    tags: 'renton-finds; full darbar' },
  { suite: 'yuba', file: 'yuba-jas.json', prefix: 'yuba', venue: 'YubaCity', split: () => 'test',
    provenance: (k, r) => `${SHEET}; Yuba City row (yuba-jas.json row ${k + 1}); human: ${r.human}`,
    tags: 'yuba-city; Cycle 10 unseen-venue test (kept test)' },
  { suite: 'l3', file: 'level3-human-sheet.json', prefix: 'l3clip', venue: 'L3', split: (r) => (recSplit.get(r.video_id) === 'L3-test' ? 'test' : 'train'),
    // only rows that are on the main tab (Cycle 10's split file lists them: 32 of the 39 level3 rows; the other 7
    // are repeat stretches of a Shabad already on the main tab)
    keep: (r) => splits.rows.some((x) => x.level === 'L3' && x.vid === r.video_id && x.a === r.start_s),
    provenance: (k, r) => `${SHEET}; Level 3 row (level3-human-sheet.json row ${k + 1}); human: ${r.human}`,
    tags: 'tags: akhand-kirtan; level 3 smagam (never used to tune)' },
];

function wavDur(f) { return (fs.statSync(f).size - 44) / 32000; }
function cloneAudio(src, dst) {
  const real = fs.realpathSync(src);
  if (fs.existsSync(dst) && fs.statSync(dst).size === fs.statSync(real).size) return;
  if (fs.existsSync(dst)) fs.rmSync(dst);
  try { execFileSync('cp', ['-c', real, dst]); } catch (_) { fs.copyFileSync(real, dst); } // APFS clone: no extra disk
}
// exclude [[a,b]] (source seconds) cuts a row into the parts outside the stretch
function cut(row, ex) {
  let parts = [row];
  for (const [a, b] of ex || []) {
    parts = parts.flatMap((p) => (b <= p.start_s || a >= p.end_s ? [p] : [
      ...(a > p.start_s ? [{ ...p, end_s: a }] : []), ...(b < p.end_s ? [{ ...p, start_s: b }] : [])]));
  }
  return parts;
}

const rows = [];
for (const G of GROUPS) {
  const truth = J(G.file);
  const jobs = new Map(SUITES[G.suite].jobs().map((j) => [j.clip, j]));
  const name = (k) => `${G.prefix}${String(k + 1).padStart(2, '0')}`;
  for (const [k, r] of truth.entries()) {
    const id = name(k);
    const job = jobs.get(id);
    if (G.keep && !G.keep(r)) continue;
    if (!job || !fs.existsSync(job.wav)) { console.log(`skip ${id} (${r.video_id}): no audio cut`); continue; }
    const cs = Math.max(0, r.start_s - 30);
    const dur = wavDur(job.wav);
    const ce = cs + dur;
    // human truth rows in the clip: its own row + the previous main-tab row(s) of the same recording in the lead-in
    const truthRows = [];
    const corr = [];
    for (const [i, o] of truth.entries()) {
      if (o.video_id !== r.video_id || (G.keep && !G.keep(o)) || o.shabad_ids.length !== 1) continue;
      const own = i === k;
      if (!own && !(o.start_s < r.start_s && o.end_s > cs)) continue; // only earlier rows reaching into the lead-in
      const n = notes[name(i)] || {};
      const ids = [n.truth_override || o.shabad_ids[0], ...(n.also_correct || [])];
      let end = o.end_s;
      if (n.end_override_s && n.end_override_s < end) { end = n.end_override_s; if (own) corr.push(`end_override_s ${n.end_override_s}`); }
      if (own && n.also_correct) corr.push(`also_correct ${n.also_correct.join('|')}`);
      if (own && n.exclude) corr.push(`exclude ${n.exclude.map((e) => e.join('-')).join(', ')} s (no kirtan)`);
      for (const p of cut({ start_s: o.start_s, end_s: end }, n.exclude)) {
        const a = Math.max(0, p.start_s - cs);
        const b = Math.min(dur, p.end_s - cs);
        if (b - a >= 1) truthRows.push({ shabadId: [...new Set(ids)].join('|'), start_s: r2(a), end_s: r2(b), source: 'human', own });
      }
    }
    truthRows.sort((a, b) => a.start_s - b.start_s);
    const wc = notes[id] && notes[id].wrong_check ? Object.entries(notes[id].wrong_check).map(([at, v]) => `${at} shown ${v.shown}: ${v.answer}`).join(', ') : '';
    const x86 = X86.some((p) => id.startsWith(p));
    const lead = truthRows.filter((t) => !t.own);
    const meta = {
      // Akhand Kirtan smagams get their own folder (user, Oct 16 2026); the GAB-Akhand tier rule decides
      id, content_folder: require('./gab-score').tierOf({ gurdwara: r.gurdwara, notes: G.tags }) === 'akhand' ? '5-akhand-kirtan' : '1-kirtan-shabad', bani: null, bani_id: null, gurdwara: r.gurdwara, reader: null, acoustics: 'hall',
      origin: r.link || `https://youtu.be/${r.video_id}?t=${r.start_s}`, source_file: path.basename(job.wav), duration_s: r2(dur),
      split: G.split(r), session: `${G.venue}-${r.video_id}`, truth_provenance: G.provenance(k, r), suite_jobs: `${G.suite}:${id}`,
      cache: 'no', cache_id: job.id, lines_n: 0, lines_source: 'none', shabads_n: truthRows.length,
      notes: [G.tags, `truth line: ${r.line}`, lead.length ? `lead-in: previous Shabad ${lead.map((t) => `${t.shabadId} ${t.start_s}-${t.end_s} s`).join(', ')} (main-tab row of the same recording)` : '',
        corr.length ? `ear-check corrections: ${corr.join('; ')}` : '', wc ? `Wrong Switch Check: ${wc}` : '', r.notes || r.note || '', x86 ? X86_NOTE : '', 'boundaries approximate (a few seconds)'].filter(Boolean).join('; '),
    };
    rows.push({ meta, truthRows, wav: job.wav });
  }
}

// cache status (local cache; the entries are pulled from Azure with gab pull)
const { DEFAULT_ROOT } = require('./emis-cache');
const CACHE = path.resolve(process.env.VF_EMIS_CACHE || DEFAULT_ROOT);
const MODEL_DIR = (() => { try { return fs.readdirSync(CACHE).find((d) => /-q16$/.test(d)); } catch (_) { return null; } })();
for (const x of rows) x.meta.cache = MODEL_DIR && fs.existsSync(path.join(CACHE, MODEL_DIR, x.meta.cache_id, 'index.jsonl')) ? 'yes' : 'no';
// AZURE (set by --azure below): ids whose entry is in the shared Azure bench-cache also count as cached (gab pull fetches them)
function markAzure(have) { for (const x of rows) if (have.has(x.meta.cache_id)) x.meta.cache = 'yes'; }

(async () => {
if (flag('azure')) {
  const remote = require('./remote-cache');
  const listing = await remote.list();
  const sha12 = MODEL_DIR.split('-')[0];
  markAzure(new Set(rows.filter((x) => listing.has(`${remote.PREFIX}/${sha12}/q16/${remote.audioSha(x.wav)}.bin`)).map((x) => x.meta.cache_id)));
}
const by = {};
for (const x of rows) { const k = `${x.meta.suite_jobs.split(':')[0]} ${x.meta.split}`; by[k] = (by[k] || 0) + 1; }
console.log(`${rows.length} clips, ${(rows.reduce((a, x) => a + x.meta.duration_s, 0) / 3600).toFixed(2)} h: ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ')}; cache yes ${rows.filter((x) => x.meta.cache === 'yes').length}`);
console.log(`switch rows (a lead-in Shabad before the clip's own): ${rows.filter((x) => x.truthRows.some((t) => !t.own)).length} clips`);
if (flag('dry-run')) { for (const x of rows.slice(0, 4)) console.log(JSON.stringify(x.meta), x.truthRows); return; }

const H = 'id,content_folder,bani,gurdwara,acoustics,split,duration_s,suite_jobs,cache,cache_id,lines_n,lines_source,shabads_n,truth_provenance,origin,source_file,reader,audio,notes,session';
for (const x of rows) {
  const dir = path.join(OUT, x.meta.content_folder, x.meta.id);
  fs.mkdirSync(dir, { recursive: true });
  if (!flag('no-audio')) cloneAudio(x.wav, path.join(dir, 'audio.wav'));
  fs.writeFileSync(path.join(dir, 'shabads.csv'), csv('shabadId,start_s,end_s,source', x.truthRows));
  fs.writeFileSync(path.join(dir, 'lines.csv'), 'verseId,start_s,end_s,confidence,source\n');
  fs.writeFileSync(path.join(dir, 'meta.json'), `${JSON.stringify(x.meta, null, 1)}\n`);
}
// append to a manifest text: existing records kept byte for byte; only this tool's own earlier rows are replaced
function appendRows(prev) {
  const head = prev.split('\n')[0].replace(/\r$/, '');
  if (head.trim() !== H) throw new Error('unexpected manifest header');
  const mine = new Set(rows.map((x) => x.meta.id));
  const recs = []; let cur = ''; let q = false; // records (quoted newlines stay inside a record)
  for (const ch of prev.replace(/\n$/, '')) { if (ch === '"') q = !q; if (ch === '\n' && !q) { recs.push(cur); cur = ''; } else cur += ch; }
  if (cur) recs.push(cur);
  const kept = recs.slice(1).filter((l) => !mine.has(l.split(',')[0]));
  const added = csv(H, rows.map((x) => ({ ...x.meta, audio: `${x.meta.content_folder}/${x.meta.id}/audio.wav` }))).split('\n').slice(1).filter(Boolean);
  return { text: [recs[0], ...kept, ...added].join('\n') + '\n', kept: kept.length, added: added.length };
}
const mf = path.join(OUT, 'manifest.csv');
const loc = appendRows(fs.readFileSync(mf, 'utf8'));
fs.writeFileSync(mf, loc.text);
console.log(`manifest ${mf}: ${loc.kept} rows kept + ${loc.added} added = ${loc.kept + loc.added}`);

// --hf: the same rows into khalisfoundation/GurbaniAutopilotBench: the manifest on HF is downloaded and appended to
// (never replaced by the local copy), and the clip folders are uploaded, in one commit
if (flag('hf')) {
  const os = require('os');
  const REPO = 'khalisfoundation/GurbaniAutopilotBench';
  const token = fs.readFileSync(path.join(os.homedir(), '.vf-hf-token'), 'utf8').trim();
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'gab-add-'));
  (async () => {
    try {
      const r = await fetch(`https://huggingface.co/datasets/${REPO}/resolve/main/manifest.csv`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`HF ${r.status} reading manifest.csv`);
      const hf = appendRows(await r.text());
      fs.writeFileSync(path.join(T, 'manifest.csv'), hf.text);
      const ops = [['manifest.csv', path.join(T, 'manifest.csv')]];
      for (const x of rows) for (const f of ['audio.wav', 'shabads.csv', 'lines.csv', 'meta.json']) ops.push([`${x.meta.content_folder}/${x.meta.id}/${f}`, path.join(OUT, x.meta.content_folder, x.meta.id, f)]);
      fs.writeFileSync(path.join(T, 'ops.json'), JSON.stringify(ops));
      fs.writeFileSync(path.join(T, 'push.py'), `
import os, sys, json
from huggingface_hub import HfApi, CommitOperationAdd
api = HfApi(token=os.environ['HF_TOKEN'])
ops = [CommitOperationAdd(dst, src) for dst, src in json.load(open(sys.argv[1]))]
r = api.create_commit(repo_id='${REPO}', repo_type='dataset', operations=ops, commit_message=sys.argv[2])
print('committed', len(ops), 'files', r.oid)
`);
      const UV = fs.existsSync(path.join(os.homedir(), '.local/bin/uv')) ? path.join(os.homedir(), '.local/bin/uv') : 'uv';
      console.log(`HF manifest: ${hf.kept} rows kept + ${hf.added} added; uploading ${rows.length} clip folders ...`);
      console.log(execFileSync(UV, ['run', '-q', '--no-project', '--with', 'huggingface_hub', 'python', '-I', path.join(T, 'push.py'), path.join(T, 'ops.json'),
        `Add ${rows.length} human-verified Level-2 sheet rows: Renton Finds, Gurdwara Yuba City, Level-3 smagams (GAB-Akhand Kirtan); cache recorded on x86`], { encoding: 'utf8', env: { ...process.env, HF_TOKEN: token }, maxBuffer: 64 << 20 }).trim());
    } catch (e) { console.error(String(e.message).replace(/hf_[A-Za-z0-9]+/g, 'hf_REDACTED')); process.exitCode = 1; } finally { fs.rmSync(T, { recursive: true, force: true }); }
  })();
}
})().catch((e) => { console.error(String(e.message || e).replace(/sig=[^&\s"']+/g, 'sig=REDACTED')); process.exit(1); });
