#!/usr/bin/env node
/* hf-ingest.js — keep the Fremont-style line-labelled recordings (Hugging Face khalisfoundation/sttm_desktop_*,
 * pushed by STTM Desktop's push_sttm_desktop_recording.py: audio parquet + verse_timestamps.csv = the verse the
 * sevadaar had on screen, README front matter collection/duration/dataset_type) in the benchmark, incrementally.
 *
 *   node hf-ingest.js                 list the org, pull NEW / CHANGED datasets, convert, truth, session + split
 *   node hf-ingest.js --dry-run       list + classify + show what would be pulled; writes nothing
 *   node hf-ingest.js --inventory     print the inventory / split tables from the ledger (no network)
 *   node hf-ingest.js --retag         recompute the content tag (kirtan / sung Bani) from the local verse files
 *   node hf-ingest.js --push-benchmark  (after vf-benchmark-build.js) upload the new clip folders + manifest.csv +
 *                                     README.md to khalisfoundation/GurbaniAutopilotBench. Off unless asked.
 *
 * Keyed by dataset id + revision sha (ledger research/level2-dataset/hf-jaspal/ledger.json, committed): a dataset
 * already ingested at the same sha is never downloaded again; a new sha re-pulls it but keeps its clip id,
 * session and split. Nothing ever moves between splits.
 *
 * Per pulled dataset -> ~/personal/live-darbar-venues/hf-jaspal/<dataset>/{audio.wav (16 kHz mono PCM16),
 * verse_timestamps.csv, README.md, meta.json}; the parquet is deleted after conversion. The clip is linked as
 * <clips>/khNN_<dataset>.wav and its truth row (same shape as before: {name, dataset, clip, seconds, shabads,
 * timeline:[{t, verseId, shabadId, line, lines}]}, consecutive repeats collapsed) is added to khalis-tests.json.
 *
 * Classification (tags in the ledger): empty (no parquet) -> skipped; collection test_* / unknown_* -> the
 * user's own app test sessions whose verse file is the app's own screen, not a sevadaar -> excluded; dataset_type
 * paath -> inventory only (not a kirtan clip); everything else = kirtan, pulled.
 *
 * Sessions + split (decided once per session, frozen in the ledger): datasets of one collection whose recordings
 * are less than SESSION_GAP_H apart form one recording session (one darbar). A session's split is
 *   PINS (sessions holding a pinned dataset; kh01-kh06 stay in TEST so earlier numbers stay comparable), else
 *   h = first 4 bytes of sha1(SALT + session key) mod 100  ->  h < 60 train, < 80 dev, else test,
 * computed per Gurdwara (collection) so every Gurdwara is split the same way. New recordings that fall inside an
 * existing session join it (and its split); new sessions get the hash rule. Never re-salt.
 *
 * Token: env HF_TOKEN or ~/.vf-hf-token (read, never printed). Parquet decode: uv + pyarrow (hf-parquet-wav.py, -I).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };

const TOOLS = __dirname;
const DS = path.join(__dirname, '..');
const ROOT = path.resolve(DS, '../..');
const ORG = 'khalisfoundation';
const PREFIX = 'sttm_desktop_';
const BENCH_REPO = `${ORG}/GurbaniAutopilotBench`;
const LEDGER = path.join(DS, 'hf-jaspal', 'ledger.json');
const TESTS = path.join(DS, 'khalis-tests.json');
const STORE = path.resolve(arg('store', path.join(os.homedir(), 'personal/live-darbar-venues/hf-jaspal')));
const CLIPS = process.env.VF_CLIPS || path.join(os.homedir(), 'personal/live-darbar-venues/clips');
const UV = [path.join(os.homedir(), '.local/bin/uv'), '/opt/homebrew/bin/uv', '/usr/local/bin/uv'].find((f) => fs.existsSync(f));
const FFMPEG = [path.join(os.homedir(), '.local/bin/ffmpeg'), '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'].find((f) => fs.existsSync(f));

// ---- the split rule (frozen: changing any of these after tuning starts would move recordings) ----
const RULE = {
  version: 1,
  salt: 'vf-kirtan-split-2026-10-13',
  sessionGapH: 2,
  buckets: [['train', 60], ['dev', 80], ['test', 100]], // h < 60 train, < 80 dev, < 100 test
  pins: { // dataset -> split; the whole session follows (kh01-kh05 = one darbar Oct 7 PT, kh06 = Oct 8 PT)
    sttm_desktop_2026_10_08T03_18_48_617Z: 'test', sttm_desktop_2026_10_08T03_30_14_004Z: 'test', sttm_desktop_2026_10_08T03_40_41_289Z: 'test',
    sttm_desktop_2026_10_08T03_51_10_447Z: 'test', sttm_desktop_2026_10_08T04_05_00_105Z: 'test', sttm_desktop_2026_10_09T03_56_15_071Z: 'test',
  },
};
const GURDWARA = { gurdwara_sahib_fremont: 'Gurdwara Sahib Fremont (Jaspal)' };
const PROVENANCE = 'sevadaar screen (human, may lag)';
const RUN_AT = new Date().toISOString();

const token = () => (process.env.HF_TOKEN || (() => { try { return fs.readFileSync(path.join(os.homedir(), '.vf-hf-token'), 'utf8'); } catch (_) { return ''; } })()).trim();
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return d; } };
const writeJ = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, `${JSON.stringify(o, null, 1)}\n`); };
const say = (...a) => console.log(...a);

async function hf(url, { raw = false } = {}) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
  if (!res.ok) throw new Error(`${url.replace(/\?.*/, '')}: HTTP ${res.status}`);
  return raw ? Buffer.from(await res.arrayBuffer()) : res.json();
}
async function download(repo, sha, file, dst) {
  const res = await fetch(`https://huggingface.co/datasets/${repo}/resolve/${sha}/${file.split('/').map(encodeURIComponent).join('/')}`, { headers: { Authorization: `Bearer ${token()}` } });
  if (!res.ok) throw new Error(`${repo}/${file}: HTTP ${res.status}`);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const tmp = `${dst}.part`;
  const out = fs.createWriteStream(tmp);
  for await (const chunk of res.body) if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
  await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
  fs.renameSync(tmp, dst);
}

function frontMatter(md) {
  const m = /^---\n([\s\S]*?)\n---/.exec(md || '');
  const o = {};
  if (m) for (const l of m[1].split('\n')) { const k = /^([a-z_]+):\s*(.*)$/.exec(l); if (k) o[k[1]] = k[2].replace(/^"|"$/g, '').trim(); }
  return o;
}
// dataset name -> recording start (UTC ms): sttm_desktop_2026_10_08T03_18_48_617Z
function startOf(name) {
  const m = /(\d{4})_(\d\d)_(\d\d)T(\d\d)_(\d\d)_(\d\d)_(\d{3})Z/.exec(name);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +m[7]) : null;
}
function wavInfo(file) {
  const b = Buffer.alloc(65536); const fd = fs.openSync(file, 'r'); const n = fs.readSync(fd, b, 0, b.length, 0); fs.closeSync(fd);
  if (b.toString('ascii', 0, 4) !== 'RIFF') throw new Error(`${file}: not a WAV`);
  let off = 12; let fmt = null;
  while (off + 8 <= n) {
    const id = b.toString('ascii', off, off + 4); const sz = b.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { format: b.readUInt16LE(off + 8), channels: b.readUInt16LE(off + 10), rate: b.readUInt32LE(off + 12), bits: b.readUInt16LE(off + 22) };
    if (id === 'data') { const bytes = Math.min(sz, fs.statSync(file).size - off - 8); return { ...fmt, duration: bytes / (fmt.rate * fmt.channels * fmt.bits / 8), ok: fmt.format === 1 && fmt.channels === 1 && fmt.rate === 16000 && fmt.bits === 16 }; }
    off += 8 + sz + (sz & 1);
  }
  throw new Error(`${file}: no data chunk`);
}
// level check: a recording that is digital silence (kh06: max |sample| 9 of 32768 on the Hub itself) or mostly
// quiet is an "audio problem", kept in the ledger but out of tuning and scoring
function audioStats(file) {
  const b = fs.readFileSync(file); let off = 12; let data = 44;
  while (off + 8 <= b.length) { const id = b.toString('ascii', off, off + 4); const sz = b.readUInt32LE(off + 4); if (id === 'data') { data = off + 8; break; } off += 8 + sz + (sz & 1); }
  const n = Math.floor((b.length - data) / 2); let ss = 0; let peak = 0; let quiet = 0; let wins = 0; let ws = 0; let wn = 0;
  for (let i = 0; i < n; i++) { const v = b.readInt16LE(data + 2 * i) / 32768; ss += v * v; ws += v * v; if (Math.abs(v) > peak) peak = Math.abs(v); if (++wn === 16000) { if (Math.sqrt(ws / wn) < 0.003) quiet++; wins++; ws = 0; wn = 0; } }
  const rmsDb = +(10 * Math.log10(ss / Math.max(1, n) + 1e-20)).toFixed(1);
  const quietPct = wins ? Math.round(100 * quiet / wins) : 100;
  return { rmsDb, peak: +peak.toFixed(3), quietPct, problem: rmsDb < -60 || quietPct > 50 ? `silent or near-silent audio (rms ${rmsDb} dBFS, ${quietPct}% of seconds quiet)` : null };
}
const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const bucket = (key) => {
  const h = crypto.createHash('sha1').update(RULE.salt + key).digest().readUInt32BE(0) % 100;
  return { h, split: RULE.buckets.find(([, lim]) => h < lim)[0] };
};

// ---- truth: verse_timestamps.csv -> timeline via BaniDB (same as the earlier khalis-tests.json rows) ----
let realmP = null;
async function realm() {
  if (!realmP) {
    const Realm = require(path.join(ROOT, 'node_modules/realm'));
    const dir = process.env.VF_BANIDB_USER_DATA || path.join(os.homedir(), 'Library/Application Support/SikhiToTheMax');
    const sj = JSON.parse(fs.readFileSync(path.join(dir, 'realm-schema-evergreen.json')));
    realmP = Realm.open({ path: path.join(dir, 'sttmdesktop-evergreen-v2.realm'), schema: sj.schemas, schemaVersion: sj.schemaVersion, readOnly: true });
  }
  return realmP;
}
const shabadVerses = new Map();
async function timelineOf(csvText) {
  const r = await realm();
  const rows = csvText.trim().split('\n').slice(1).map((l) => l.split(',')).map(([v, t]) => ({ verseId: Number(v), t: Number(t) })).filter((x) => x.verseId && Number.isFinite(x.t)).sort((a, b) => a.t - b.t);
  const tl = [];
  for (const x of rows) {
    if (tl.length && tl[tl.length - 1].verseId === x.verseId) continue;
    const v = r.objects('Verse').filtered('ID == $0', x.verseId)[0];
    const sid = v && v.Shabads.length ? v.Shabads[0].ShabadID : null;
    let line = null; let lines = null;
    if (sid != null) {
      if (!shabadVerses.has(sid)) shabadVerses.set(sid, r.objects('Verse').filtered('ANY Shabads.ShabadID == $0', sid).sorted('ID').map((y) => y.ID));
      const vs = shabadVerses.get(sid); line = vs.indexOf(x.verseId); lines = vs.length;
    }
    tl.push({ t: x.t, verseId: x.verseId, shabadId: sid, line, lines });
  }
  return tl;
}

// content folder: a recording that is (>= 80% of its verse rows) one sung Bani the app follows as a Bani is not a
// kirtan-Shabad clip (Asa di Vaar mornings, the Aarti); everything else is 1-kirtan-shabad.
const SUNG = { 90: '3-bani-sung-like-kirtan/asa-di-vaar', 22: '3-bani-sung-like-kirtan/aarti' };
async function contentOf(tl) {
  if (!tl.length) return '1-kirtan-shabad';
  const r = await realm();
  for (const [bani, folder] of Object.entries(SUNG)) {
    const n = tl.filter((x) => r.objects('Banis_Shabad').filtered('Verse.ID == $0 AND Bani.ID == $1', x.verseId, Number(bani)).length).length;
    if (n >= 0.8 * tl.length) return folder;
  }
  return '1-kirtan-shabad';
}

// ---- sessions ----
function assignSession(L, d) {
  const s0 = d.start; const s1 = d.start + (d.duration || 0) * 1000; const gap = RULE.sessionGapH * 3600e3;
  let best = null;
  for (const [key, s] of Object.entries(L.sessions)) {
    if (s.collection !== d.collection) continue;
    const dist = s0 > s.end ? s0 - s.end : s1 < s.start ? s.start - s1 : 0;
    if (dist < gap && (!best || dist < best.dist)) best = { key, dist };
  }
  if (best) {
    const s = L.sessions[best.key]; s.start = Math.min(s.start, s0); s.end = Math.max(s.end, s1); if (!s.datasets.includes(d.name)) s.datasets.push(d.name);
    const pin = RULE.pins[d.name];
    if (pin && s.split !== pin) {
      if (s.decidedAt !== RUN_AT) throw new Error(`pinned ${d.name} (${pin}) joins frozen session ${best.key} (${s.split})`);
      Object.assign(s, { split: pin, rule: `pinned (${d.name})` }); // same run: the session was not yet frozen
    }
    return best.key;
  }
  const key = `${d.collection}@${new Date(s0).toISOString().slice(0, 16)}Z`;
  const pin = RULE.pins[d.name];
  const b = bucket(key);
  L.sessions[key] = { collection: d.collection, start: s0, end: s1, datasets: [d.name], split: pin || b.split, rule: pin ? `pinned (${d.name})` : `hash ${b.h}`, decidedAt: RUN_AT };
  return key;
}

function inventory(L) {
  const ds = Object.values(L.datasets).sort((a, b) => a.start - b.start);
  const h = (s) => (s / 3600).toFixed(2);
  let out = '| dataset | clip | Gurdwara | local date (PT) | type | min | verse rows | status | session | split |\n|---|---|---|---|---|---|---|---|---|---|\n';
  for (const d of ds) {
    const pt = d.start ? new Date(d.start - 7 * 3600e3).toISOString().replace('T', ' ').slice(0, 16) : '';
    out += `| ${d.name.replace(PREFIX, '')} | ${d.clipId || ''} | ${d.gurdwara || d.collection || ''} | ${pt} | ${d.type || ''} | ${d.duration ? (d.duration / 60).toFixed(1) : ''} | ${d.rows ?? ''} | ${d.status}${d.reason ? ` (${d.reason})` : ''}${d.content && d.content !== '1-kirtan-shabad' ? ` [${d.content}]` : ''}${d.audioProblem ? ` AUDIO PROBLEM: ${d.audioProblem}` : ''} | ${d.session ? d.session.split('@')[1] : ''} | ${d.split || ''} |\n`;
  }
  const kir = ds.filter((d) => d.status === 'pulled' && !d.audioProblem && (d.content || '1-kirtan-shabad') === '1-kirtan-shabad');
  const byG = {};
  for (const d of ds) { const g = d.gurdwara || d.collection || '(none)'; byG[g] = byG[g] || { all: 0, kirtan: 0, n: 0, k: 0 }; byG[g].all += d.duration || 0; byG[g].n++; if (kir.includes(d)) { byG[g].kirtan += d.duration || 0; byG[g].k++; } }
  let g = '\n| Gurdwara (collection) | datasets | hours (all types) | kirtan clips | kirtan hours |\n|---|---|---|---|---|\n';
  for (const [k, v] of Object.entries(byG)) g += `| ${k} | ${v.n} | ${h(v.all)} | ${v.k} | ${h(v.kirtan)} |\n`;
  let sp = '\n| split | sessions | kirtan clips | kirtan hours | Gurdwaras | sessions (PT start: clips) |\n|---|---|---|---|---|---|\n';
  for (const s of ['train', 'dev', 'test']) {
    const ss = Object.entries(L.sessions).filter(([, v]) => v.split === s);
    const cl = kir.filter((d) => d.split === s);
    const desc = ss.map(([k, v]) => `${new Date(v.start - 7 * 3600e3).toISOString().slice(5, 16).replace('T', ' ')}: ${v.datasets.map((n) => L.datasets[n].clipId || '-').filter((x) => x !== '-').join(' ') || 'no kirtan'} (${v.rule})`).join('; ');
    sp += `| ${s} | ${ss.length} | ${cl.length} | ${h(cl.reduce((a, d) => a + d.duration, 0))} | ${[...new Set(ss.map(([, v]) => GURDWARA[v.collection] || v.collection))].join(', ')} | ${desc} |\n`;
  }
  return out + g + sp;
}

async function main() {
  const L = J(LEDGER, { rule: RULE, datasets: {}, sessions: {} });
  if (JSON.stringify(L.rule) !== JSON.stringify(RULE)) throw new Error('split RULE in hf-ingest.js differs from the ledger\'s frozen rule: never change it after tuning starts (add a new rule version deliberately)');
  if (flag('inventory')) { say(inventory(L)); return; }
  if (flag('push-benchmark')) return pushBenchmark(L);
  if (flag('retag')) { // recompute content tags from the local verse files (no network)
    for (const d of Object.values(L.datasets).filter((x) => x.status === 'pulled')) {
      d.content = await contentOf(await timelineOf(fs.readFileSync(path.join(d.local, 'verse_timestamps.csv'), 'utf8')));
      d.audio = audioStats(fs.realpathSync(path.join(d.local, 'audio.wav'))); d.audioProblem = d.audio.problem;
    }
    writeJ(LEDGER, L); say(inventory(L)); (await realmP).close(); return;
  }
  if (!token()) throw new Error('no HF token (HF_TOKEN or ~/.vf-hf-token)');
  const DRY = flag('dry-run');
  const ONLY = arg('only');

  // 1. list (fresh, every run)
  const list = await hf(`https://huggingface.co/api/datasets?author=${ORG}&search=${PREFIX}&limit=1000`);
  const names = list.map((d) => d.id.split('/')[1]).filter((n) => n.startsWith(PREFIX) && (!ONLY || n.includes(ONLY))).sort();
  say(`${names.length} ${ORG}/${PREFIX}* datasets on the Hub`);
  const tests = J(TESTS, []);
  const known = new Map(tests.map((t) => [t.dataset, t]));
  let nextId = Math.max(0, ...Object.values(L.datasets).map((d) => Number((d.clipId || 'kh00').slice(2))), ...tests.map((t) => Number(t.name.slice(2, 4)) || 0)) + 1;
  const todo = [];
  for (const name of names) {
    const info = await hf(`https://huggingface.co/api/datasets/${ORG}/${name}`);
    const prev = L.datasets[name];
    if (prev && prev.sha === info.sha) continue;
    const files = (info.siblings || []).map((s) => s.rfilename);
    const parquet = files.find((f) => /\.parquet$/.test(f));
    const d = { ...(prev || {}), name, sha: info.sha, created: info.createdAt, start: startOf(name), private: info.private, files: files.length };
    if (files.includes('README.md')) {
      const fm = frontMatter((await hf(`https://huggingface.co/datasets/${ORG}/${name}/resolve/${info.sha}/README.md`, { raw: true })).toString('utf8'));
      Object.assign(d, { collection: fm.collection || d.collection || '', duration: Number(fm.duration) || d.duration || null, type: fm.dataset_type || d.type || '', textSource: fm.text_source || '' });
    }
    if (files.includes('verse_timestamps.csv')) d.verseCsv = (await hf(`https://huggingface.co/datasets/${ORG}/${name}/resolve/${info.sha}/verse_timestamps.csv`, { raw: true })).toString('utf8');
    d.rows = d.verseCsv ? d.verseCsv.trim().split('\n').length - 1 : 0;
    todo.push({ d, parquet, prev });
  }
  // missing collection (one README has none): inherit from a dataset recorded within the session gap
  for (const { d } of todo) if (!d.collection) {
    const near = [...todo.map((x) => x.d), ...Object.values(L.datasets)].filter((o) => o.collection && Math.abs(o.start - d.start) < RULE.sessionGapH * 3600e3).sort((a, b) => Math.abs(a.start - d.start) - Math.abs(b.start - d.start))[0];
    if (near) { d.collection = near.collection; d.collectionInferred = near.name; }
  }
  todo.sort((a, b) => a.d.start - b.d.start);
  for (const { d, parquet } of todo) {
    if (/^(test_|unknown)/.test(d.collection)) { d.status = 'excluded'; d.reason = 'own app test session; verse file = the app\'s screen, not a sevadaar'; }
    else if (!parquet) { d.status = 'empty'; d.reason = 'no audio on the Hub'; }
    else if (d.type === 'paath') { d.status = 'inventory'; d.reason = 'paath (not a kirtan clip)'; }
    else d.status = 'pull';
    d.gurdwara = GURDWARA[d.collection] || d.collection;
    d.mic = 'laptop-mic (STTM Desktop recording on the sevadaar laptop in the hall)';
  }
  if (DRY) { for (const { d } of todo) say(`${d.name}  ${d.collection}  ${d.type}  ${d.duration}s  rows ${d.rows}  -> ${d.status}${d.reason ? ` (${d.reason})` : ''}`); return; }

  for (const { d, parquet } of todo) {
    const verseCsv = d.verseCsv; delete d.verseCsv;
    if (d.status !== 'pull') { if (d.status === 'inventory') d.session = assignSession(L, d); if (d.session) d.split = L.sessions[d.session].split; L.datasets[d.name] = d; continue; }
    const dir = path.join(STORE, d.name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'verse_timestamps.csv'), verseCsv);
    const old = known.get(d.name);
    const clipId = d.clipId || (old ? old.name.slice(0, 4) : `kh${String(nextId++).padStart(2, '0')}`);
    const clipName = `${clipId}_${d.name}`;
    const clipWav = path.join(CLIPS, `${clipName}.wav`);
    const wav = path.join(dir, 'audio.wav');
    if (old && fs.existsSync(clipWav) && !fs.lstatSync(clipWav).isSymbolicLink() && !d.clipId) {
      // kh01-kh06: audio already in clips/ (pulled before this tool); link it instead of a second copy
      if (!fs.existsSync(wav)) fs.symlinkSync(clipWav, wav);
    } else {
      const pq = path.join(dir, 'raw.parquet');
      say(`pull ${d.name} (${d.duration}s) -> ${clipId}`);
      await download(`${ORG}/${d.name}`, d.sha, parquet, pq);
      const raw = path.join(dir, 'raw.wav');
      const out = JSON.parse(execFileSync(UV, ['run', '-q', '--no-project', '--with', 'pyarrow', 'python', '-I', path.join(TOOLS, 'hf-parquet-wav.py'), pq, raw], { encoding: 'utf8' }).trim().split('\n').pop());
      d.sourceUrl = out.source_url;
      const info = wavInfo(raw);
      if (info.ok) fs.renameSync(raw, wav);
      else { execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', raw, '-ac', '1', '-ar', '16000', '-sample_fmt', 's16', wav]); fs.unlinkSync(raw); d.converted = `${info.rate} Hz ${info.channels} ch ${info.bits} bit`; }
      fs.unlinkSync(pq);
      if (fs.existsSync(clipWav) && fs.lstatSync(clipWav).isSymbolicLink()) fs.unlinkSync(clipWav);
      if (!fs.existsSync(clipWav)) fs.symlinkSync(wav, clipWav);
    }
    const info = wavInfo(fs.realpathSync(wav));
    d.wavDuration = Math.round(info.duration * 1000) / 1000;
    d.wavSha256 = sha256(fs.realpathSync(wav));
    const tl = await timelineOf(verseCsv);
    d.lastVerseT = tl.length ? tl[tl.length - 1].t : null;
    d.content = await contentOf(tl);
    d.audio = audioStats(fs.realpathSync(wav));
    d.audioProblem = d.audio.problem;
    d.checks = [Math.abs(d.wavDuration - (d.duration || d.wavDuration)) < 1 ? '' : `wav ${d.wavDuration}s vs README ${d.duration}s`, d.lastVerseT != null && d.lastVerseT > d.wavDuration + 0.5 ? `last verse ${d.lastVerseT}s after the end` : '', tl.some((x) => x.shabadId == null) ? `${tl.filter((x) => x.shabadId == null).length} verse(s) not in a Shabad` : ''].filter(Boolean);
    if (!d.duration) d.duration = d.wavDuration;
    d.session = d.session || assignSession(L, d);
    d.split = L.sessions[d.session].split;
    Object.assign(d, { clipId, clipName, local: dir, provenance: PROVENANCE, status: 'pulled', ingestedAt: new Date().toISOString() });
    delete d.reason;
    const row = { name: clipName, dataset: d.name, timeline: tl, shabads: [...new Set(tl.map((x) => x.shabadId).filter((x) => x != null))], clip: `${clipName}.wav`, seconds: Math.round(d.wavDuration * 100) / 100 };
    if (old) {
      const same = JSON.stringify(old.timeline) === JSON.stringify(tl);
      d.truthCheck = same ? 'identical to the earlier khalis-tests.json row' : 'DIFFERS from the earlier khalis-tests.json row (earlier row kept)';
    } else tests.push(row);
    fs.writeFileSync(path.join(dir, 'meta.json'), `${JSON.stringify({ ...d, truth: { rows: tl.length, shabads: row.shabads } }, null, 1)}\n`);
    L.datasets[d.name] = d;
    writeJ(LEDGER, L); // after every dataset: an interrupted run resumes
  }
  // a pinned dataset may have re-split its session later in the same run: every member follows its session
  for (const d of Object.values(L.datasets)) if (d.session) d.split = L.sessions[d.session].split;
  tests.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(TESTS, JSON.stringify(tests, null, 1));
  writeJ(LEDGER, L);
  writeJ(path.join(DS, 'hf-jaspal', 'splits.json'), Object.fromEntries(Object.entries(L.sessions).map(([k, s]) => [k, { split: s.split, rule: s.rule, clips: s.datasets.map((n) => L.datasets[n].clipId).filter(Boolean), datasets: s.datasets }])));
  say(inventory(L));
  if (realmP) (await realmP).close();
}

// ---- upload the new benchmark clip folders (opt-in) ----
function pushBenchmark(L) {
  const bench = path.resolve(arg('bench', path.join(os.homedir(), 'personal/vf-benchmark')));
  const folders = Object.values(L.datasets).filter((d) => d.status === 'pulled').map((d) => `${require("./folder-names").canonFolder(d.content || "1-kirtan-shabad")}/${d.clipName}`).filter((f) => fs.existsSync(path.join(bench, f)));
  say(`upload ${folders.length} clip folders + manifest.csv + README.md + coverage.json to ${BENCH_REPO}`);
  const py = `
import os, sys
from huggingface_hub import HfApi
api = HfApi(token=os.environ['HF_TOKEN'])
bench, folders = sys.argv[1], sys.argv[2:]
pats = ['manifest.csv', 'README.md', 'coverage.json'] + [f'{f}/*' for f in folders]
api.upload_folder(repo_id='${BENCH_REPO}', repo_type='dataset', folder_path=bench, allow_patterns=pats, commit_message='Add Fremont sevadaar-screen kirtan clips (hf-ingest.js)')
print('ok')
`;
  const f = path.join(os.tmpdir(), `vf-push-${process.pid}.py`);
  fs.writeFileSync(f, py);
  try { say(execFileSync(UV, ['run', '-q', '--no-project', '--with', 'huggingface_hub', 'python', '-I', f, bench, ...folders], { encoding: 'utf8', env: { ...process.env, HF_TOKEN: token() } })); } finally { fs.unlinkSync(f); }
}

main().then(() => process.exit(0), (e) => { console.error(String(e && e.stack || e).replace(/hf_[A-Za-z0-9]+/g, 'hf_REDACTED')); process.exit(1); });
