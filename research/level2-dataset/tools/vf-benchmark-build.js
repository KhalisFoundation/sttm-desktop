#!/usr/bin/env node
/* vf-benchmark-build.js — assemble the Voice-Follow benchmark dataset (Hugging Face
 * khalisfoundation/GurbaniAutopilotBench) from the clips and truth already on this Mac.
 *
 *   node vf-benchmark-build.js --out <dir> [--only aa28,pt54] [--no-audio]
 *
 * Layout (the user's content split):
 *   1-kirtan-shabad/<clip>/        2-bani-recited/<bani>/<clip>/      3-bani-sung-like-kirtan/<bani>/<clip>/      4-akhand-paath/<clip>/
 *   <clip>/audio.wav (16 kHz mono PCM16), lines.csv, shabads.csv, meta.json; manifest.csv + README.md at the top.
 * Sources are read, never modified. Audio already 16 kHz mono PCM16 is copied byte for byte; anything else
 * is converted (ffmpeg if present, else a plain WAV re-header is refused and the clip is skipped).
 * Truth: the Level-2 Human-Fully sheet export, paath/aarti/khalis test sheets, Renton Oct 11 forced-aligned
 * truth + kirtan targets, Newton truth + taps, ut13 truth, paath-seq (Sehaj) sequences, and the forced-alignment
 * line truth produced by line-truth.js (<cache>/line-truth/truth/<clip>.json).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { SUITES, CLIPS, DS } = require('./vf-suites');
const { DEFAULT_ROOT } = require('./emis-cache');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const flag = (n) => argv.includes(`--${n}`);
const OUT = path.resolve(arg('out', path.join(process.env.HOME, 'personal/vf-benchmark')));
const ONLY = arg('only') ? new Set(arg('only').split(',')) : null;
const CACHE = path.resolve(process.env.VF_EMIS_CACHE || DEFAULT_ROOT);
const MODEL_DIR = (() => { try { return fs.readdirSync(CACHE).find((d) => /-q16$/.test(d)); } catch (_) { return null; } })();
const cached = (id) => !!(MODEL_DIR && fs.existsSync(path.join(CACHE, MODEL_DIR, id, 'index.jsonl')));
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const r1 = (x) => (x == null || x === '' ? '' : Math.round(Number(x) * 100) / 100);
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = (header, rows) => [header, ...rows.map((r) => header.split(',').map((h) => csvCell(r[h])).join(','))].join('\n') + '\n';

const BANI_FOLDER = { 2: 'japji', 4: 'jaap', 6: 'tav-prasad-savaiye', 9: 'chaupai', 10: 'anand-40', 21: 'rehras', 23: 'sohila', 22: 'aarti', 90: 'asa-di-vaar' };
const BANI_NAME = { 2: 'Japji Sahib', 4: 'Jaap Sahib', 6: 'Tav Prasad Savaiye', 9: 'Chaupai Sahib', 10: 'Anand Sahib', 21: 'Rehras Sahib', 22: 'Aarti', 23: 'Kirtan Sohila', 90: 'Asa di Vaar' };
const PAATH_FOLDERS = ['japji', 'jaap', 'tav-prasad-savaiye', 'chaupai', 'anand-40', 'rehras', 'sohila', 'salok-kabeer', 'salok-fareed', 'salok-m9'];
const SUNG_FOLDERS = ['aarti', 'asa-di-vaar', 'rehras-sung', 'saloks-sung'];

// ---------------------------------------------------------------- wav ----------------
function wavInfo(file) {
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(64 * 1024);
  const n = fs.readSync(fd, head, 0, head.length, 0);
  fs.closeSync(fd);
  if (head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${file}: not a WAV`);
  let off = 12;
  let fmt = null;
  let data = null;
  while (off + 8 <= n) {
    const id = head.toString('ascii', off, off + 4);
    const sz = head.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { format: head.readUInt16LE(off + 8), channels: head.readUInt16LE(off + 10), rate: head.readUInt32LE(off + 12), bits: head.readUInt16LE(off + 22) };
    if (id === 'data') { data = { offset: off + 8, size: sz }; break; }
    off += 8 + sz + (sz & 1);
  }
  if (!fmt || !data) throw new Error(`${file}: fmt/data chunk not found in the first 64 KB`);
  const size = fs.statSync(file).size;
  const bytes = Math.min(data.size || size - data.offset, size - data.offset);
  return { ...fmt, dataOffset: data.offset, dataBytes: bytes, duration: bytes / (fmt.rate * fmt.channels * (fmt.bits / 8)), ok: fmt.format === 1 && fmt.channels === 1 && fmt.rate === 16000 && fmt.bits === 16 };
}
function putAudio(src, dst) {
  const real = fs.realpathSync(src);
  const info = wavInfo(real);
  if (info.ok) {
    if (!fs.existsSync(dst) || fs.statSync(dst).size !== fs.statSync(real).size) fs.copyFileSync(real, dst);
    return { duration: info.duration, converted: false };
  }
  const ffmpeg = [path.join(process.env.HOME, '.local/bin/ffmpeg'), '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'].find((f) => fs.existsSync(f));
  if (!ffmpeg) throw new Error(`${src}: ${info.rate} Hz ${info.channels} ch ${info.bits} bit, no ffmpeg to convert`);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', real, '-ac', '1', '-ar', '16000', '-sample_fmt', 's16', dst]);
  return { duration: wavInfo(dst).duration, converted: true };
}

// ---------------------------------------------------------------- truth -----------------
const sheet = J(path.join(DS, 'human-fully-sheet.json'));
const notes = J(path.join(DS, 'clip-notes.json'));
const paath = J(path.join(DS, 'paath-tests.json'));
const aarti = J(path.join(DS, 'aarti/aarti-tests.json'));
const khalis = J(path.join(DS, 'khalis-tests.json'));
const targets = J(path.join(DS, 'renton-oct11/kirtan-targets.json'));
const ut13 = J(path.join(DS, 'ut13-truth.json'));
const seq = J(path.join(DS, 'paath-seq-tests.json'));
const taps = J(path.join(DS, 'newton/taps.json'));
const r1a = J(path.join(DS, 'aarti/renton-manifests/manifest-r1a.json')).segments;
const r6 = J(path.join(DS, 'aarti/renton-manifests/manifest-r6.json')).segments;
// sep27 Aarti pieces: the aarti-score.js fallback rows (sheet rows; the ab-81-86c file is not in this tree)
const sep27 = [{ start: 14, end: 103, shabadId: 7596 }, { start: 108, end: 141, shabadId: 8875 }, { start: 141, end: 162, shabadId: 8095 }];
const PIECES = { r1aarti: [...r1a, { start: 375, end: 450, shabadId: 4967 }], r6aarti: r6, sep27 };
const NOT_AARTI = new Set(['pt37', 'pt42', 'pt46']);

const SHEET_URL = 'Google Sheet "Human-Fully" (human source of record); research/level2-dataset/human-fully-sheet.json is its export';

// aligned line truth files -> lines.csv rows (clip time = truth time - offset)
function alignedLines(file, offset = 0, { useApp = true } = {}) {
  if (!fs.existsSync(file)) return null;
  const t = J(file);
  return t.lines.filter((l) => !l.header && (useApp ? l.appVerseId != null : l.verseId != null)).map((l) => ({
    verseId: useApp && l.appVerseId != null ? l.appVerseId : l.verseId, start_s: r1(l.start - offset), end_s: r1(l.end - offset), confidence: l.check ?? l.conf ?? '', source: 'aligned',
  })).filter((l) => l.end_s > 0);
}
const lineTruthCache = (id) => alignedLines(path.join(CACHE, 'line-truth', 'truth', `${id}.json`), 0, { useApp: false });

// ---------------------------------------------------------------- clip registry ---------
const clips = [];
const add = (c) => { if (!ONLY || ONLY.has(c.id) || ONLY.has(c.clip)) clips.push({ cacheId: c.id, ...c }); };
const jobsOf = (suite) => SUITES[suite].jobs();
const byClip = (suite) => new Map(jobsOf(suite).map((j) => [j.clip, j]));

// 1. Level-2 kirtan (41) — dev
for (const [k, row] of sheet.entries()) {
  const clip = `clip${String(k + 1).padStart(2, '0')}`;
  const job = byClip('l2').get(clip);
  if (!job) continue;
  const cs = Math.max(0, row.start_s - 30);
  const note = notes[clip] || {};
  const ids = [note.truth_override || row.shabad_ids[0], ...(note.also_correct || [])];
  add({ id: clip, clip, cacheId: job.id, wav: job.wav, folder: '1-kirtan-shabad', bani: '', gurdwara: row.gurdwara, reader: '', acoustics: 'hall',
    origin: row.link || `https://youtu.be/${row.video_id}?t=${row.start_s}`, src: row.video_id, srcRange: [cs, row.end_s + 10], split: 'dev', suite_jobs: `l2:${clip}`,
    truth_provenance: `${SHEET_URL}; row ${k + 1}; ${note.reason ? `clip-notes.json: ${note.reason}` : 'human: ' + row.human}`,
    shabads: [{ shabadId: ids.join('|'), start_s: row.start_s - cs, end_s: row.end_s - cs, source: 'human' }],
    lines: lineTruthCache(job.id), notes: [note.kind ? `${note.kind}` : '', `truth line: ${row.line}`].filter(Boolean).join('; ') });
}

// 2. Paath (read Banis) and the YouTube Aarti rows (sung; same audio as aa28-aa42) — dev
const aaByPt = {}; // pt35 -> aa28 (symlinked audio)
for (const [k, row] of aarti.entries()) if (/^pt\d\d$/.test(row.src)) aaByPt[row.src] = `aa${String(k + 1).padStart(2, '0')}`;
for (const [k, row] of paath.entries()) {
  const clip = `pt${String(k + 1).padStart(2, '0')}`;
  const job = byClip('paath').get(clip);
  if (!job) continue;
  const cs = Math.max(0, row.start_s - 30);
  const bani = row.bani_id;
  const aa = aaByPt[clip];
  const sung = bani === 22;
  const live = /live|darbar|gurdwara/i.test(row.gurdwara);
  add({ id: clip, clip, cacheId: job.id, wav: job.wav, folder: sung ? '3-bani-sung-like-kirtan/aarti' : `2-bani-recited/${BANI_FOLDER[bani]}`, bani: BANI_NAME[bani], baniId: bani, gurdwara: row.gurdwara, reader: '', acoustics: live ? 'hall' : 'studio',
    origin: `https://youtu.be/${row.video_id}?t=${row.start_s}`, src: row.video_id, srcRange: [cs, row.end_s + 10], split: 'dev',
    suite_jobs: [`paath:${clip}`, aa && !NOT_AARTI.has(clip) ? `aarti:${aa}` : ''].filter(Boolean).join(';'),
    truth_provenance: `paath-tests.json row ${k + 1} (${row.verified || row.human}); Bani id from the video title${aa ? `; aarti-tests.json row ${aa.slice(2)} (same audio, listed there as ${aa})` : ''}`,
    shabads: [{ shabadId: `bani:${bani}`, start_s: row.start_s - cs, end_s: row.end_s - cs, source: 'human' }],
    lines: lineTruthCache(job.id), notes: [`acoustics inferred from the source title`, aa ? `also Aarti clip ${aa}` : '', NOT_AARTI.has(clip) ? 'aarti-score.js: NOT Aarti in this window (excluded from the Aarti suite)' : ''].filter(Boolean).join('; ') });
}

// 3. Aarti sung (Renton recordings; the YouTube rows are the pt clips above) — dev
for (const [k, row] of aarti.entries()) {
  const clip = `aa${String(k + 1).padStart(2, '0')}`;
  if (/^pt\d\d$/.test(row.src)) continue; // audio already under its pt id
  const job = byClip('aarti').get(clip);
  if (!job) continue;
  const cs = Math.max(0, row.start_s - 30);
  const pieces = (PIECES[row.src] || []).filter((p) => Number(p.shabadId) && p.end > cs && p.start < row.end_s + 10)
    .map((p) => ({ shabadId: Number(p.shabadId), start_s: r1(Math.max(0, p.start - cs)), end_s: r1(p.end - cs), source: 'human' }));
  const where = { r1aarti: 'Renton Wednesday Aarti (hall)', r6aarti: 'Renton Friday Aarti (hall)', sep27: 'Renton Sep 27 production (hall)', hall: 'Renton hall test Sep 25', oct5: 'Renton Oct 5 production (board feed)' }[row.src] || row.gurdwara;
  const excluded = row.src === 'sep27' && row.offset >= 494;
  add({ id: clip, clip, cacheId: job.id, wav: job.wav, folder: '3-bani-sung-like-kirtan/aarti', bani: 'Aarti', baniId: 22, gurdwara: 'Gurdwara Sahib Renton', reader: '', acoustics: 'hall',
    origin: `Renton recording ${row.src} (live-darbar-renton-dataset), ${cs}-${row.end_s + 10} s`, src: row.src, srcRange: [cs, row.end_s + 10], split: 'dev', suite_jobs: excluded ? '' : `aarti:${clip}`,
    truth_provenance: `aarti-tests.json row ${k + 1} (human: ${row.human}); pieces from ${row.src === 'sep27' ? 'the Sep 27 sheet rows (aarti-score.js)' : `manifest-${row.src === 'r1aarti' ? 'r1a' : 'r6'}.json`}`,
    shabads: [{ shabadId: 'bani:22', start_s: row.start_s - cs, end_s: (row.src === 'sep27' && row.offset === 434 ? 480 : row.end_s) - cs, source: 'human' }, ...pieces],
    lines: lineTruthCache(job.id), notes: [where, excluded ? 'aarti-score.js: window starts after the Aarti ended (kirtan); not scored' : '', row.src === 'sep27' && row.offset === 434 ? 'truth end 480 s (kirtan 5393 begins ~8:00)' : ''].filter(Boolean).join('; ') });
}

// 4. Fremont (Jaspal, app-recorded, line-level human timeline: the verse the sevadaar had on screen). Every
//    recording hf-ingest.js pulled (hf-jaspal/ledger.json): split = its recording session's frozen split,
//    content folder = its tag (kirtan, or a sung Bani: Asa di Vaar / Aarti). kh01-kh05 also keep their fremont job.
const ledger = J(path.join(DS, 'hf-jaspal', 'ledger.json'));
const ingested = new Map(Object.values(ledger.datasets).filter((d) => d.status === 'pulled').map((d) => [d.name, d]));
for (const r of khalis) {
  const clip = r.name.slice(0, 4);
  const wav = path.join(CLIPS, r.clip);
  if (!fs.existsSync(wav)) continue;
  const L = ingested.get(r.dataset) || {};
  const tl = r.timeline;
  const lines = tl.map((e, i) => ({ verseId: e.verseId, start_s: e.t, end_s: i + 1 < tl.length ? tl[i + 1].t : r1(r.seconds), confidence: 1, source: 'human' }));
  const shabads = [];
  for (const [i, e] of tl.entries()) {
    const last = shabads[shabads.length - 1];
    if (last && last.shabadId === e.shabadId) last.end_s = i + 1 < tl.length ? tl[i + 1].t : r1(r.seconds);
    else shabads.push({ shabadId: e.shabadId, start_s: e.t, end_s: i + 1 < tl.length ? tl[i + 1].t : r1(r.seconds), source: 'human' });
  }
  const folder = require('./folder-names').canonFolder(L.content || '1-kirtan-shabad');
  const jobs = [/^kh0[1-5]$/.test(clip) ? `fremont:${clip}` : '', folder === '1-kirtan-shabad' && L.name && !L.audioProblem ? `jaspal:${clip}` : ''].filter(Boolean).join(';');
  add({ id: path.basename(r.clip, '.wav'), clip, wav, folder, bani: { '3-bani-sung-like-kirtan/asa-di-vaar': 'Asa di Vaar', '3-bani-sung-like-kirtan/aarti': 'Aarti' }[folder] || '', baniId: { '3-bani-sung-like-kirtan/asa-di-vaar': 90, '3-bani-sung-like-kirtan/aarti': 22 }[folder],
    gurdwara: L.gurdwara || 'Gurdwara Sahib Fremont (Jaspal)', reader: '', acoustics: 'laptop-mic',
    origin: `https://huggingface.co/datasets/khalisfoundation/${r.dataset}`, src: r.dataset, srcRange: [0, r.seconds], split: L.split || 'test', session: L.session || '', suite_jobs: jobs,
    truth_provenance: `${L.provenance || 'sevadaar screen (human, may lag)'}: verse_timestamps.csv of ${r.dataset} (the line the sevadaar put on screen while it was sung)`, shabads, lines,
    notes: [L.audioProblem ? `AUDIO PROBLEM (not scored): ${L.audioProblem}` : '', L.content && L.content !== '1-kirtan-shabad' ? 'sung Bani recording (not in the kirtan suites)' : '', L.mic ? `mic: ${L.mic}` : ''].filter(Boolean).join('; ') });
}

// 5. Renton Oct 11 (production, S1/S2 app session audio) — test
{
  const parts = {
    rt11_rehras: { folder: '2-bani-recited/rehras', bani: 21, session: 'S1', truth: 'results/rt11_rehrasX.app.truth.json', note: 'Rehras read at extra-long; truth realigned with the app\'s own verse ids (rt11_rehrasX.app.truth.json)' },
    rt11_aarti: { folder: '3-bani-sung-like-kirtan/aarti', bani: 22, session: 'S1', truth: 'renton-oct11/truth/rt11_aarti.truth.json' },
    rt11_sohila: { folder: '2-bani-recited/sohila', bani: 23, session: 'S2', truth: 'renton-oct11/truth/rt11_sohila.truth.json' },
    rt11_kirtan1: { folder: '1-kirtan-shabad', session: 'S2' },
    rt11_fareed1: { folder: '3-bani-sung-like-kirtan/saloks-sung', session: 'S2', note: 'Salok Fareed 5299 sung as kirtan with a parmaan (5286) inside' },
    rt11_fareed2: { folder: '3-bani-sung-like-kirtan/saloks-sung', session: 'S2', note: 'Salok Fareed 5238 sung as kirtan' },
    rt11_hukamnama: { folder: '1-kirtan-shabad', session: 'S2', note: 'Hukamnama read, then short Shabads read' },
    rt11_handover: { folder: '3-bani-sung-like-kirtan/aarti', bani: 22, session: 'S1', note: 'Rehras tail (Bani on screen) then the Aarti begins at 279 s; the switch case of MVP 9.0.1', ut13: 'rt11_handover' },
  };
  for (const [p, d] of Object.entries(parts)) {
    const wav = path.join(CLIPS, `${p}.wav`);
    if (!fs.existsSync(wav)) continue;
    const dur = wavInfo(wav).duration;
    const off = targets.clipOffsets[p];
    const shabads = [];
    if (d.bani) shabads.push({ shabadId: `bani:${d.bani}`, start_s: 0, end_s: r1(dur), source: 'human' });
    if (off != null) {
      const ts = targets.targets.filter((x) => x.startedSec != null && x.startedSec >= off - 5 && x.startedSec < off + dur).sort((a, b) => a.startedSec - b.startedSec);
      ts.forEach((x, i) => shabads.push({ shabadId: x.shabadId, start_s: r1(Math.max(0, x.startedSec - off)), end_s: x.kind === 'parmaan' ? r1(x.startedSec - off + 44) : i + 1 < ts.length && ts[i + 1].kind !== 'parmaan' ? r1(ts[i + 1].startedSec - off) : r1(dur), source: x.startedSource.startsWith('forced') ? 'aligned' : 'human' }));
      if (p === 'rt11_kirtan1') shabads.unshift({ shabadId: 2053, start_s: 0, end_s: 500, source: 'human' });
    }
    if (d.ut13) for (const s of ut13[d.ut13].segments) if (s.expect) shabads.push({ shabadId: s.expect.join('|'), start_s: s.start, end_s: s.end, source: 'human' });
    const lines = d.truth ? alignedLines(path.join(DS, d.truth)) : null;
    const inSuite = SUITES.renton.jobs().some((j) => j.clip === p);
    add({ id: p, clip: p, wav, folder: d.folder, bani: d.bani ? BANI_NAME[d.bani] : '', baniId: d.bani, gurdwara: 'Gurdwara Sahib Renton', reader: '', acoustics: 'hall',
      origin: `Renton Oct 11 2026 production, app session ${d.session === 'S1' ? '2026-10-12T00-36-21-730Z' : '2026-10-12T01-18-07-299Z'} (${d.session})`, src: off != null ? 'rt11_S2' : `rt11_${p}`, srcRange: off != null ? [off, off + dur] : [0, dur], split: 'test',
      suite_jobs: inSuite ? `renton:${p}` : '', truth_provenance: d.truth ? 'forced alignment of the Bani text (Renton follower-bench aligner), confidence = check; only check >= 0.6 is scored' : d.ut13 ? 'ut13-truth.json (human, from the PC\'s live transcript + human.jsonl)' : 'renton-oct11/kirtan-targets.json (onsets: forced alignment or transcript +-3 s)',
      shabads, lines, notes: [d.note || '', inSuite ? '' : 'not in the renton suite; scored by ut13-bench.js (no cache entry)'].filter(Boolean).join('; ') });
  }
}

// 6. Newton Oct 11 (Khalsa School Newton, Asa di Vaar) — test; YouTube Asa di Vaar — dev
{
  const PARTS = { nw11_asa1: 110, nw11_asa2: 1640, nw11_kirtan2: 830, nw11_kirtan3: 1890, nw11_kirtan4: 2680, nw11_session: 0 };
  const truthOf = (part, off, dur) => {
    const files = part === 'nw11_session' ? ['nw11_asa1', 'nw11_asa2'] : /asa/.test(part) ? [part] : [];
    const out = [];
    for (const f of files) for (const l of alignedLines(path.join(DS, `newton/truth/${f}.truth.json`), off) || []) if (l.start_s < dur) out.push(l);
    return out.length ? out : null;
  };
  for (const [p, off] of Object.entries(PARTS)) {
    const wav = path.join(CLIPS, `${p}.wav`);
    if (!fs.existsSync(wav)) continue;
    const dur = wavInfo(wav).duration;
    const tp = taps.filter((t) => t.t >= off && t.t < off + dur);
    const shabads = tp.map((t, i) => ({ shabadId: t.shabadId, start_s: r1(t.t - off), end_s: r1(i + 1 < tp.length ? tp[i + 1].t - off : dur), source: 'human' }));
    if (/asa/.test(p)) shabads.unshift({ shabadId: 'bani:90', start_s: 0, end_s: r1(dur), source: 'human' });
    if (p === 'nw11_session') { shabads.unshift({ shabadId: 'bani:90', start_s: 110, end_s: 840, source: 'human' }); shabads.push({ shabadId: 'bani:90', start_s: 1640, end_s: 1900, source: 'human' }); }
    const folder = /asa|session/.test(p) ? '3-bani-sung-like-kirtan/asa-di-vaar' : '1-kirtan-shabad';
    add({ id: p, clip: p, wav, folder, bani: /asa|session/.test(p) ? 'Asa di Vaar' : '', baniId: /asa|session/.test(p) ? 90 : undefined, gurdwara: 'Khalsa School Newton', reader: '', acoustics: 'hall',
      origin: 'Newton Oct 11 2026 session (app recording, stitched 16 kHz)', src: 'nw11', srcRange: [off, off + dur], split: 'test', suite_jobs: `asa:${p}`,
      truth_provenance: 'newton/truth (forced alignment of Asa di Vaar, confidence = check) + newton/taps.json (the Shabads he tapped, human)',
      shabads, lines: truthOf(p, off, dur), notes: p === 'nw11_session' ? 'whole session (parts are cuts of it; hours counted once)' : `cut of nw11_session at ${off} s` });
  }
  const yt = SUITES.asa.jobs().find((j) => j.id.startsWith('ytasa1'));
  if (yt && fs.existsSync(yt.wav)) {
    add({ id: yt.id, clip: yt.id, wav: yt.wav, folder: '3-bani-sung-like-kirtan/asa-di-vaar', bani: 'Asa di Vaar', baniId: 90, gurdwara: 'YouTube Asa di Vaar', reader: '', acoustics: 'studio',
      origin: 'https://youtu.be/4IXk2t_Irqo?t=900', src: '4IXk2t_Irqo', srcRange: [900, 1620], split: 'dev', suite_jobs: `asa:${yt.id}`,
      truth_provenance: 'newton/truth/ytasa1.truth.json (forced alignment, confidence = check)', shabads: [{ shabadId: 'bani:90', start_s: 0, end_s: 720, source: 'human' }],
      lines: alignedLines(path.join(DS, 'newton/truth/ytasa1.truth.json')), notes: '' });
  }
}

// 7. User test Oct 13 (two shadow sessions of the same singing, MacBook mic) — test
for (const k of ['ut13_s90', 'ut13_s91']) {
  const wav = path.join(CLIPS, ut13[k].wav);
  if (!fs.existsSync(wav)) continue;
  add({ id: k, clip: k, wav, folder: '1-kirtan-shabad', bani: '', gurdwara: 'User test (Arash, home)', reader: 'Arash', acoustics: 'laptop-mic',
    origin: `shadow session recording, ${k === 'ut13_s90' ? 'MVP 9.0 app 2026-10-13T10-50-03-213Z' : '9.1 candidate 2026-10-13T10-50-25-631Z'}`, src: 'ut13', srcRange: k === 'ut13_s90' ? [0, 856] : [22.4, 856], split: 'test', suite_jobs: '',
    truth_provenance: 'ut13-truth.json (human: the PC\'s live transcript + human.jsonl; expect = ids that count as right incl. copies and the containing Bani)',
    shabads: ut13[k].segments.filter((s) => s.expect).map((s) => ({ shabadId: s.expect.join('|'), start_s: s.start, end_s: s.end, source: 'human' })), lines: null,
    notes: 'several Shabads + Rehras + Aarti in one sitting; scored by ut13-bench.js (sttm-901); no cache entry' });
}

// 8. Sehaj paath (Akhand-paath proxy: consecutive SGGS Shabads read) — dev
for (const r of seq.filter((x) => /^sp/.test(x.name))) {
  const wav = path.join(CLIPS, r.clip);
  if (!fs.existsSync(wav)) continue;
  add({ id: path.basename(r.clip, '.wav'), clip: r.name, wav, folder: '4-akhand-paath', bani: '', gurdwara: r.gurdwara, reader: r.gurdwara.split(',').pop().trim(), acoustics: 'studio',
    origin: `https://youtu.be/${r.video_id}?t=${r.start_s}`, src: r.video_id, srcRange: [r.start_s, r.end_s], split: 'dev', suite_jobs: '',
    truth_provenance: 'paath-seq-tests.json: every Shabad of the Angs read, in order; onsets unknown', shabads: r.sequence.map((s) => ({ shabadId: s, start_s: '', end_s: '', source: 'human' })), lines: null,
    notes: `${r.note}; scored by the akhand-paath sequence bench (sttm-akhand); no cache entry` });
}

// ---------------------------------------------------------------- write -----------------
fs.mkdirSync(OUT, { recursive: true });
for (const b of PAATH_FOLDERS) fs.mkdirSync(path.join(OUT, '2-bani-recited', b), { recursive: true });
for (const b of SUNG_FOLDERS) fs.mkdirSync(path.join(OUT, '3-bani-sung-like-kirtan', b), { recursive: true });
for (const f of ['1-kirtan-shabad', '4-akhand-paath']) fs.mkdirSync(path.join(OUT, f), { recursive: true });

const rows = [];
for (const c of clips) {
  const dir = path.join(OUT, c.folder, c.id);
  fs.mkdirSync(dir, { recursive: true });
  let duration = c.duration;
  if (!flag('no-audio')) ({ duration } = putAudio(c.wav, path.join(dir, 'audio.wav')));
  else duration = wavInfo(fs.realpathSync(c.wav)).duration;
  // a line key a person reviewed (linelabel, meta.json line_label) is never replaced by a rebuild from machine truth
  const prevMeta = (() => { try { return J(path.join(dir, 'meta.json')); } catch (_) { return null; } })();
  const reviewed = prevMeta && prevMeta.line_label && fs.existsSync(path.join(dir, 'lines.csv'));
  const lines = reviewed ? fs.readFileSync(path.join(dir, 'lines.csv'), 'utf8').trim().split('\n').slice(1).filter(Boolean) : c.lines || [];
  if (!reviewed) fs.writeFileSync(path.join(dir, 'lines.csv'), csv('verseId,start_s,end_s,confidence,source', lines));
  fs.writeFileSync(path.join(dir, 'shabads.csv'), csv('shabadId,start_s,end_s,source', c.shabads));
  const meta = { id: c.id, content_folder: c.folder, bani: c.bani || null, bani_id: c.baniId ?? null, gurdwara: c.gurdwara, reader: c.reader || null, acoustics: c.acoustics, origin: c.origin,
    source_file: path.basename(c.wav), duration_s: r1(duration), split: c.split, session: c.session || undefined, truth_provenance: c.truth_provenance, suite_jobs: c.suite_jobs, cache: cached(c.cacheId) ? 'yes' : 'no', cache_id: c.cacheId,
    lines_n: lines.length, lines_source: reviewed ? prevMeta.lines_source : lines.length ? lines[0].source : 'none', shabads_n: c.shabads.length, notes: c.notes || '',
    ...(reviewed ? { line_label: prevMeta.line_label } : {}) };
  fs.writeFileSync(path.join(dir, 'meta.json'), `${JSON.stringify(meta, null, 1)}\n`);
  rows.push({ ...meta, session: c.session || '', audio: `${c.folder}/${c.id}/audio.wav`, _src: c.src, _range: c.srcRange });
}
// rows another tool added to the existing manifest (not built here) are kept as they are, never dropped
if (!ONLY) {
  try {
    const prev = fs.readFileSync(path.join(OUT, 'manifest.csv'), 'utf8').replace(/\r\n/g, '\n');
    const lines = []; let cur = ''; let q = false;
    for (const ch of prev) { if (ch === '"') q = !q; if (ch === '\n' && !q) { lines.push(cur); cur = ''; } else cur += ch; }
    if (cur) lines.push(cur);
    const head = lines[0].split(',');
    const cells = (l) => { const out = []; let c = ''; let qq = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (qq) { if (ch === '"' && l[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') qq = false; else c += ch; } else if (ch === '"') qq = true; else if (ch === ',') { out.push(c); c = ''; } else c += ch; } out.push(c); return out; };
    const built = new Set(rows.map((r) => r.id));
    for (const l of lines.slice(1)) {
      const v = cells(l); const r = Object.fromEntries(head.map((h, i) => [h, v[i]]));
      if (r.id && !built.has(r.id)) { r.duration_s = Number(r.duration_s) || 0; rows.push(r); console.log(`kept ${r.id} (in the existing manifest, not built here)`); }
    }
  } catch (_) { /* no manifest yet */ }
}
const H = 'id,content_folder,bani,gurdwara,acoustics,split,duration_s,suite_jobs,cache,cache_id,lines_n,lines_source,shabads_n,truth_provenance,origin,source_file,reader,audio,notes,session';
fs.writeFileSync(path.join(OUT, 'manifest.csv'), csv(H, rows));

// coverage: clips, clip hours, unique audio hours (union of source ranges per source recording)
const folders = ['1-kirtan-shabad', ...PAATH_FOLDERS.map((b) => `2-bani-recited/${b}`), ...SUNG_FOLDERS.map((b) => `3-bani-sung-like-kirtan/${b}`), '4-akhand-paath'];
const union = (list) => {
  const by = {};
  for (const r of list) if (r._src && r._range) (by[r._src] = by[r._src] || []).push(r._range);
  let total = 0;
  for (const ranges of Object.values(by)) {
    ranges.sort((a, b) => a[0] - b[0]);
    let [s, e] = ranges[0];
    for (const [a, b] of ranges.slice(1)) { if (a > e) { total += e - s; [s, e] = [a, b]; } else e = Math.max(e, b); }
    total += e - s;
  }
  return total;
};
const cov = folders.map((f) => {
  const L = rows.filter((r) => r.content_folder === f);
  const noSess = L.filter((r) => !/^nw11_(asa|kirtan)/.test(r.id)); // cuts of nw11_session
  return { folder: f, clips: L.length, train: L.filter((r) => r.split === 'train').length, dev: L.filter((r) => r.split === 'dev').length, test: L.filter((r) => r.split === 'test').length, hours: L.reduce((a, r) => a + r.duration_s, 0) / 3600, unique: union(noSess) / 3600, cached: L.filter((r) => r.cache === 'yes').length };
});
let table = '| content folder | clips (train / dev / test) | clip hours | unique audio hours | clips with a model-output cache entry |\n|---|---|---|---|---|\n';
for (const c of cov) table += c.clips ? `| \`${c.folder}\` | ${c.clips} (${c.train} / ${c.dev} / ${c.test}) | ${c.hours.toFixed(2)} | ${c.unique.toFixed(2)} | ${c.cached} |\n` : `| \`${c.folder}\` | 0 — **gap, no recordings yet** | 0 | 0 | 0 |\n`;
const tot = cov.reduce((a, c) => ({ clips: a.clips + c.clips, hours: a.hours + c.hours, unique: a.unique + c.unique, cached: a.cached + c.cached }), { clips: 0, hours: 0, unique: 0, cached: 0 });
table += `| **total** | **${tot.clips}** (${rows.filter((r) => r.split === 'train').length} / ${rows.filter((r) => r.split === 'dev').length} / ${rows.filter((r) => r.split === 'test').length}) | **${tot.hours.toFixed(2)}** | **${tot.unique.toFixed(2)}** | ${tot.cached} |\n`;
for (const c of cov) if (!c.clips) fs.writeFileSync(path.join(OUT, c.folder, 'README.md'), `# ${c.folder}\n\nno recordings yet\n`);

const tmpl = fs.readFileSync(path.join(__dirname, 'vf-benchmark-README.md'), 'utf8');
fs.writeFileSync(path.join(OUT, 'README.md'), tmpl.replace('{{COVERAGE}}', table.trim()).replace('{{N_CLIPS}}', String(rows.length)).replace('{{HOURS}}', tot.hours.toFixed(1)).replace('{{UNIQUE_HOURS}}', tot.unique.toFixed(1)));
fs.writeFileSync(path.join(OUT, 'coverage.json'), JSON.stringify(cov, null, 1));
console.log(table);
console.log(`${rows.length} clips -> ${OUT}`);
