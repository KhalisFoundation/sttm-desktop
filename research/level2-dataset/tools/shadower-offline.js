#!/usr/bin/env node
/* shadower-offline.js — the OFFLINE half of Shadower (STTM's automatic data collector).
 *
 * The prod Shadower build only records the diwan audio (16 kHz mono wav segments) and the sevadaar's screen
 * (human.jsonl, verses.csv, events.jsonl with audio_anchor, session.json with t0) and uploads them to Azure. No model
 * runs on Gurdwara Sahib computers, so everything that needs the model runs here:
 *
 *   shadower-offline run <session dir | raw/<gurdwara>/<tester>/<date>/<session>> [...more]
 *        [--build <app worktree>] [--out <dir>] [--no-cache] [--keep-audio] [--force]
 *     1. fetch      the session folder from Azure (read-only; SAS from VF_AZURE_SAS or ~/.vf-azure-sas, never printed)
 *                   or use a local copy
 *     2. stitch     every audio file onto the session clock (audio_anchor start; else the audio_segment event's t;
 *                   audio-pre.wav ends at its pre_roll event) -> one wav, silence where nothing was recorded
 *     3. replay     the speech model + the Voice Autopilot logic of --build over that wav, exactly as GAB replays a
 *                   clip (bench-driver.js: the real VoiceFollow component, full BaniDB, deterministic; model passes
 *                   recorded into the shared emissions cache so a re-score never runs the model again), under the
 *                   bench lock at nice 19 -> system.offline.jsonl (what Autopilot would have shown) + activity
 *                   (loudness and letters heard per second)
 *     4. score      the replay against the sevadaar's screen with
 *                   - shadow score.js (the prod collector's own scorer: lag-tolerant Shabad agreement, line
 *                     agreement, signed switch delay vs the sevadaar, listen list), and
 *                   - GAB's sangat-score (per second: right pangti / right Shabad / wrong Shabad / nothing,
 *                     wrong-Shabad s/h, catch-up lag, Shabad find and switch times) on the sevadaar's screen as a
 *                     human pangti key. The sevadaar's screen LAGS the audio (people click after they hear the
 *                     pangti), so "behind" and "lag" numbers include the sevadaar's own delay.
 *                   Only seconds the sevadaar chose count: a screen change the live Autopilot made (an experimental
 *                   session where Autopilot drove the screen: the system.jsonl row came first) is not a human label
 *                   and is left out of the score (reported as "Autopilot-made screen").
 *     5. emit       <out>/reports/<slug>.json      per-session report (no machine facts, no IP)
 *                   <out>/timeline/<slug>.json     the session as one clip of the GAB timeline page
 *                   <out>/training/<slug>/         candidate training rows, Jaspal's HF layout: one folder per pangti
 *                                                  <ts>/<ts>.wav + <ts>/<ts>.csv (verseId,timestamp_seconds) and
 *                                                  rows.csv with confidence silver (the model agrees with the
 *                                                  sevadaar) or needs-check (it does not). Never uploaded here.
 *   shadower-offline summary [--date YYYY-MM-DD] [--out <dir>]     one-page markdown across the processed sessions
 *   shadower-offline publish-timeline [--dry-run] [--out <dir>]    the "Real sessions" set on the private GAB Space
 *                                                                  timeline page (timeline/ files only; the
 *                                                                  leaderboard rows are not touched)
 *   shadower-offline list                                           Azure sessions, outside (non-developer) first
 *
 * Mac rules: one model job at a time (lockf -k /tmp/vf-bench.lock, nice -n 19, VF_ORT_THREADS=3); downloaded audio
 * and the stitched wav are deleted after each session unless --keep-audio.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawn } = require('child_process');

const TOOLS = __dirname;
const SR = 16000;
const CHUNK = 2048;
const HOME_ROOT = path.join(os.homedir(), 'personal/live-darbar-venues/shadower');
const MODEL = require('./speech-pack').speechModel().onnx;
const USERDATA = process.env.VF_BANIDB_USER_DATA || path.join(os.homedir(), 'Library/Application Support/SikhiToTheMax');
const DEFAULT_BUILD = path.join(os.homedir(), 'personal/live-darbar-venues/cache/worktrees/5348d9a02f06'); // 9.0.5, what the experimental fleet runs
const LOCK = '/tmp/vf-bench.lock';
const FFMPEG = [path.join(os.homedir(), '.local/bin/ffmpeg'), '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'].find((f) => fs.existsSync(f)) || 'ffmpeg';
const SCORE_JS_REF = 'arash/vf-prod-collector-dev:www/main/addons/voice-follow/shadow/score.js';
const MIN_FREE_GB = 15;
// training rows
const ROW_MIN_S = 2;
const ROW_MAX_S = 30;
const ROW_LEAD_S = 3; // audio kept before the click: the sevadaar clicks after the pangti began
const AGREE_TOL_S = 3;
const SILVER_MIN = 0.5;
// an Autopilot-made screen change: the live system.jsonl row came this soon before the screen label
const ECHO_S = 0.25;

let A = [];
const flag = (n) => A.includes(`--${n}`);
const arg = (n, d) => { const i = A.indexOf(`--${n}`); return i >= 0 && A[i + 1] && !A[i + 1].startsWith('--') ? A[i + 1] : d; };
const r1 = (x) => (x == null ? null : +Number(x).toFixed(1));
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return d; } };
const jsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean) : []);
const redact = (s) => String(s).replace(/sig=[^&\s"']+/g, 'sig=REDACTED');
const outRoot = () => path.resolve(arg('out', HOME_ROOT));
const freeBytes = (dir) => { fs.mkdirSync(dir, { recursive: true }); return Number(execFileSync('df', ['-k', dir], { encoding: 'utf8' }).trim().split('\n').pop().split(/\s+/)[3]) * 1024; };
const mmss = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600); const m = Math.floor(s / 60) % 60; return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(s % 60).padStart(2, '0')}`; };

// ------------------------------------------------------------------------- Azure (read-only) --
async function listPrefix(prefix) {
  const { ACCOUNT, sas } = require('./gab-harvest');
  const out = [];
  let marker = '';
  for (;;) {
    const r = await fetch(`${ACCOUNT}?restype=container&comp=list&prefix=${encodeURIComponent(prefix)}&maxresults=5000${marker ? `&marker=${encodeURIComponent(marker)}` : ''}&${sas()}`);
    if (!r.ok) throw new Error(`Azure listing HTTP ${r.status}`);
    const xml = await r.text();
    for (const m of xml.matchAll(/<Blob><Name>([^<]*)<\/Name>(.*?)<\/Blob>/g)) {
      const len = /<Content-Length>(\d+)</.exec(m[2]);
      out.push({ name: m[1].replace(/&amp;/g, '&'), size: len ? +len[1] : 0 });
    }
    const nm = /<NextMarker>([^<]*)<\/NextMarker>/.exec(xml);
    marker = nm ? nm[1] : '';
    if (!marker) break;
  }
  return out;
}
// -> { dir, key, downloaded: [files] }
async function fetchSession(spec) {
  if (fs.existsSync(path.join(spec, 'session.json')) || fs.existsSync(path.join(spec, 'human.jsonl'))) return { dir: path.resolve(spec), key: path.basename(path.resolve(spec)), downloaded: [] };
  const key = spec.replace(/^\/+|\/+$/g, '');
  if (!/^raw\/[^/]+\/[^/]+\/[^/]+\/[^/]+$/.test(key)) throw new Error(`not a session folder or Azure session prefix (raw/<gurdwara>/<tester>/<date>/<session>): ${spec}`);
  const { download } = require('./gab-harvest');
  const dir = path.join(HOME_ROOT, 'work', key);
  const blobs = (await listPrefix(`${key}/`)).filter((b) => !b.name.slice(key.length + 1).includes('/'));
  if (!blobs.length) throw new Error(`no files under ${key}/`);
  const need = blobs.reduce((a, b) => a + b.size, 0);
  if (freeBytes(HOME_ROOT) - need * 3 < MIN_FREE_GB * 1e9) throw new Error(`fetching ${(need / 1e9).toFixed(1)} GB (+ stitched wav) would leave < ${MIN_FREE_GB} GB free`);
  const downloaded = [];
  for (const b of blobs) {
    const f = b.name.slice(key.length + 1);
    const dst = path.join(dir, f);
    if (fs.existsSync(dst) && fs.statSync(dst).size === b.size) continue;
    await download(b.name, dst);
    downloaded.push(f);
  }
  return { dir, key, downloaded };
}

// ------------------------------------------------------------------------- stitch --
// every audio file of the session on the session clock -> one 16 kHz mono s16 wav
function decodePcm(file) {
  return execFileSync(FFMPEG, ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 's16le', '-'], { maxBuffer: 2 ** 31 });
}
function placements(dir) {
  const ev = jsonl(path.join(dir, 'events.jsonl')).sort((a, b) => (a.t || 0) - (b.t || 0));
  const anchor = {};
  const segT = {};
  let pre = null;
  for (const e of ev) {
    if (e.type === 'audio_anchor' && e.file && anchor[e.file] == null) anchor[e.file] = { start: Number(e.start), via: e.via || 'anchor' };
    if (e.type === 'audio_segment' && e.file && segT[e.file] == null) segT[e.file] = e.t;
    if (e.type === 'pre_roll') pre = e;
  }
  const files = fs.readdirSync(dir).filter((f) => /^audio-(pre|\d+)\.(wav|webm|ogg)$/.test(f)).sort();
  const out = [];
  for (const f of files) {
    let start = null;
    let via = null;
    if (anchor[f]) { start = anchor[f].start; via = `audio_anchor${anchor[f].via !== 'anchor' ? ` (${anchor[f].via})` : ''}`; } else if (/^audio-pre\./.test(f) && pre) { start = null; via = 'pre_roll'; } else if (segT[f] != null) { start = segT[f]; via = 'audio_segment event'; }
    if (via == null) continue;
    out.push({ file: f, start, via, pre: via === 'pre_roll' ? pre : null });
  }
  return out;
}
function writeWavHeader(fd, dataBytes) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + dataBytes, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(dataBytes, 40);
  fs.writeSync(fd, h, 0, 44, 0);
}
function stitch(dir, wavOut) {
  const segs = placements(dir);
  if (!segs.length) throw new Error('no audio files with a place on the session clock');
  for (const s of segs) {
    const pcm = decodePcm(path.join(dir, s.file));
    s.samples = pcm.length / 2;
    s.pcmFile = `${wavOut}.${s.file}.pcm`;
    fs.writeFileSync(s.pcmFile, pcm);
    if (s.pre) s.start = (s.pre.endsAt != null ? Number(s.pre.endsAt) : s.pre.t) - s.samples / SR;
  }
  segs.sort((a, b) => a.start - b.start);
  const fd = fs.openSync(wavOut, 'w');
  writeWavHeader(fd, 0);
  let cursor = 0; // samples written
  const report = [];
  const ZERO = Buffer.alloc(SR * 2 * 10);
  for (const s of segs) {
    const off = Math.round(Math.max(0, s.start) * SR);
    let skip = Math.round(Math.max(0, -s.start) * SR); // audio before t=0 (a pre-roll longer than the clock)
    let gap = 0;
    if (off > cursor) {
      gap = off - cursor;
      for (let left = gap * 2; left > 0; left -= ZERO.length) fs.writeSync(fd, ZERO, 0, Math.min(left, ZERO.length));
      cursor = off;
    } else if (off < cursor) skip += cursor - off; // overlap: keep what is already written
    const pcm = fs.readFileSync(s.pcmFile);
    fs.rmSync(s.pcmFile);
    const from = Math.min(pcm.length, skip * 2);
    if (pcm.length > from) fs.writeSync(fd, pcm, from, pcm.length - from);
    cursor += (pcm.length - from) / 2;
    report.push({ file: s.file, via: s.via, start_s: +s.start.toFixed(3), seconds: +(s.samples / SR).toFixed(2), gap_before_s: +(gap / SR).toFixed(2), overlap_s: +((skip * 2 > 0 ? skip : 0) / SR).toFixed(2) });
  }
  writeWavHeader(fd, cursor * 2);
  fs.closeSync(fd);
  return { wav: wavOut, seconds: +(cursor / SR).toFixed(2), segments: report };
}

// ------------------------------------------------------------------------- replay (child) --
// node shadower-offline.js --replay-child <wav> <events out> <cache id>   (run by replay(), under the lock)
async function replayChild([wav, outFile, cacheId]) {
  const { createDriver } = require(path.join(TOOLS, 'bench-driver'));
  const out = fs.openSync(outFile, 'w');
  const keep = ['shabad', 'verse', 'seeking', 'pane', 'length', 'component-error'];
  const driver = await createDriver({
    model: MODEL, userData: USERDATA, cacheId,
    onEvent: (ev) => {
      if (keep.includes(ev.type)) fs.writeSync(out, `${JSON.stringify({ t: ev.t, type: ev.type, shabadId: ev.shabadId, verseId: ev.verseId, visible: ev.visible, message: ev.message })}\n`);
      else if (ev.type === 'transcript') fs.writeSync(out, `${JSON.stringify({ t: ev.t, type: 'transcript', text: ev.text, confidence: ev.confidence })}\n`);
    },
  });
  await driver.start();
  const fd = fs.openSync(wav, 'r');
  const total = (fs.statSync(wav).size - 44) / 2;
  const buf = Buffer.alloc(CHUNK * 2);
  const wall0 = Date.now();
  let lastLog = 0;
  for (let p = 0; p < total; p += CHUNK) {
    const n = fs.readSync(fd, buf, 0, Math.min(CHUNK, total - p) * 2, 44 + p * 2) / 2;
    const f = new Float32Array(n);
    for (let i = 0; i < n; i++) f[i] = buf.readInt16LE(i * 2) / 32768;
    await driver.push(f, (p + n) / SR);
    if (Date.now() - lastLog > 60000) { lastLog = Date.now(); process.stderr.write(`  replay ${mmss((p + n) / SR)} of ${mmss(total / SR)} (${((Date.now() - wall0) / 1000).toFixed(0)} s wall)\n`); }
  }
  fs.closeSync(fd);
  await driver.stop();
  fs.closeSync(out);
  fs.writeFileSync(`${outFile}.done.json`, JSON.stringify({ audio_s: total / SR, wall_s: (Date.now() - wall0) / 1000 }));
}
function replay({ wav, eventsFile, cacheId, build }) {
  const useCache = !flag('no-cache');
  const { DEFAULT_ROOT } = require('./emis-cache');
  const env = { ...process.env, VF_DRIVER_ROOT: build, MODEL, VF_ORT_THREADS: '3', ...(useCache ? { VF_EMIS_CACHE: process.env.VF_EMIS_CACHE || DEFAULT_ROOT, VF_EMIS_MODE: 'record' } : { VF_DETERMINISTIC: '1' }) };
  const pre = fs.existsSync(path.join(build, 'www/main/addons/voice-follow/shadow/config.js')) ? ['-r', path.join(TOOLS, 'no-shadow-preload.js')] : [];
  const args = ['-k', LOCK, 'nice', '-n', '19', process.execPath, ...pre, __filename, '--replay-child', wav, eventsFile, cacheId];
  process.stderr.write(`  waiting for ${LOCK} (one model job at a time) ...\n`);
  return new Promise((resolve, reject) => spawn('lockf', args, { cwd: TOOLS, env, stdio: ['ignore', 'inherit', 'inherit'] }).on('close', (code) => (code ? reject(new Error(`replay exited ${code}`)) : resolve(readJson(`${eventsFile}.done.json`, {})))));
}

// ------------------------------------------------------------------------- timelines --
// replay events -> system rows in the shape bus.system() writes (partial updates on the session clock)
function systemRows(events) {
  const rows = [];
  for (const e of events) {
    if (e.type === 'shabad') {
      const s = String(e.shabadId);
      if (s.startsWith('bani:')) rows.push({ t: e.t, bani: Number(s.slice(5)), shabadId: null, verseId: e.verseId ?? null, slide: null });
      else rows.push({ t: e.t, shabadId: Number(e.shabadId), verseId: e.verseId ?? null });
    } else if (e.type === 'verse') rows.push({ t: e.t, verseId: e.verseId });
    else if (e.type === 'seeking') rows.push({ t: e.t, slide: e.visible ? true : null });
  }
  return rows;
}
// per second: loudest RMS (over 2048-sample blocks, as the app's meter) and most letters heard (transcripts)
function activityRows(wav, events) {
  const fd = fs.openSync(wav, 'r');
  const total = (fs.statSync(wav).size - 44) / 2;
  const secs = Math.ceil(total / SR);
  const level = new Float32Array(secs);
  const buf = Buffer.alloc(SR * 2);
  for (let s = 0; s < secs; s++) {
    const n = fs.readSync(fd, buf, 0, Math.min(SR, total - s * SR) * 2, 44 + s * SR * 2) / 2;
    for (let b = 0; b < n; b += CHUNK) {
      let sum = 0;
      const e = Math.min(n, b + CHUNK);
      for (let i = b; i < e; i++) { const x = buf.readInt16LE(i * 2) / 32768; sum += x * x; }
      level[s] = Math.max(level[s], Math.sqrt(sum / Math.max(1, e - b)));
    }
  }
  fs.closeSync(fd);
  const letters = new Int32Array(secs);
  const text = new Array(secs).fill('');
  for (const e of events) {
    if (e.type !== 'transcript') continue;
    const s = Math.floor(e.t);
    if (s < 0 || s >= secs) continue;
    const n = String(e.text || '').replace(/\s+/g, '').length;
    if (n > letters[s]) { letters[s] = n; text[s] = String(e.text || '').trim(); }
  }
  return Array.from({ length: secs }, (_, s) => ({ t: s, level: Math.round(level[s] * 1000) / 1000, letters: letters[s], text: text[s] }));
}
// human rows: which screen changes the live Autopilot made (an experimental session where it drove the screen)
function markAutopilotMade(human, liveSystem) {
  const st = liveSystem.map((r) => r.t).sort((a, b) => a - b);
  let j = 0;
  for (const h of human) {
    while (j + 1 < st.length && st[j + 1] <= h.t) j++;
    h.byAutopilot = h.override === false || (st.length && st[j] <= h.t && h.t - st[j] < ECHO_S && h.override !== true);
  }
  return human;
}
// events for the scorer: the session's own (gaps, mic, visible), live-only health events dropped (the offline replay
// never pauses), plus visible stretches over every Autopilot-made screen (not a human label: not scored)
function scoringEvents(events, human) {
  const keep = events.filter((e) => !['paused', 'resumed', 'vf_down', 'vf_up', 'vf_visible', 'vf_hidden'].includes(e.type));
  const vis = [];
  let on = false;
  for (const e of events.filter((x) => x.type === 'vf_visible' || x.type === 'vf_hidden').map((x) => ({ t: x.t, v: x.type === 'vf_visible' }))
    .concat(human.map((h) => ({ t: h.t, v: !!h.byAutopilot, human: true }))).sort((a, b) => a.t - b.t)) {
    if (e.v && !on) { vis.push({ t: e.t, type: 'vf_visible' }); on = true; } else if (!e.v && on && e.human) { vis.push({ t: e.t, type: 'vf_hidden' }); on = false; }
  }
  return [...keep, ...vis].sort((a, b) => (a.t || 0) - (b.t || 0));
}

// the prod collector's own scorer (shadow/score.js), from the fork branch so prod and offline score alike
function shadowScore() {
  const cached = path.join(HOME_ROOT, 'score-js', 'score.js');
  if (process.env.SHADOW_SCORE_JS) return require(path.resolve(process.env.SHADOW_SCORE_JS));
  try {
    const src = execFileSync('git', ['-C', TOOLS, 'show', SCORE_JS_REF], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    fs.mkdirSync(path.dirname(cached), { recursive: true });
    if (!fs.existsSync(cached) || fs.readFileSync(cached, 'utf8') !== src) fs.writeFileSync(cached, src);
  } catch (_) {
    if (!fs.existsSync(cached)) return require(path.join(TOOLS, '../../../www/main/addons/voice-follow/shadow/score.js'));
  }
  return require(cached);
}

// ------------------------------------------------------------------------- GAB scoring --
// a one-clip GAB dataset from the sevadaar's screen: pangti rows (lines.csv, source human) and Shabad/Bani rows
// (shabads.csv) only over the scored seconds (Gurbani on the sevadaar's screen, chosen by the sevadaar, words heard)
function gabDataset(root, id, meta, perSec) {
  const folder = '0-real-session';
  const d = path.join(root, folder, id);
  fs.mkdirSync(d, { recursive: true });
  const lines = [];
  const shabads = [];
  let cur = null;
  let curS = null;
  const flushL = () => { if (cur) lines.push(cur); cur = null; };
  const flushS = () => { if (curS) shabads.push(curS); curS = null; };
  perSec.forEach((x, s) => {
    if (!x.scored || x.key == null) { flushL(); flushS(); return; }
    const sid = x.key.startsWith('bani:') ? x.key : x.key.startsWith('shabad:') ? x.key.slice(7) : null;
    if (sid == null) { flushL(); flushS(); return; }
    if (curS && curS.id === sid && curS.end === s) curS.end = s + 1; else { flushS(); curS = { id: sid, start: s, end: s + 1 }; }
    if (x.verse == null) { flushL(); return; }
    if (cur && cur.v === x.verse && cur.end === s) cur.end = s + 1; else { flushL(); cur = { v: x.verse, start: s, end: s + 1 }; }
  });
  flushL(); flushS();
  fs.writeFileSync(path.join(d, 'lines.csv'), `verseId,start_s,end_s,confidence,source\n${lines.map((l) => `${l.v},${l.start},${l.end},1,human`).join('\n')}\n`);
  fs.writeFileSync(path.join(d, 'shabads.csv'), `shabadId,start_s,end_s,source\n${shabads.map((l) => `${l.id},${l.start},${l.end},human`).join('\n')}\n`);
  const cols = 'id,content_folder,bani,gurdwara,acoustics,split,duration_s,suite_jobs,cache,cache_id,lines_n,lines_source,shabads_n,truth_provenance,origin,source_file,reader,audio,notes,session';
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  fs.writeFileSync(path.join(root, 'manifest.csv'), `${cols}\n${[id, folder, '', q(meta.gurdwara), 'hall', 'real', meta.dur, `real:${id}`, 'no', id, lines.length, 'human', shabads.length, q('sevadaar screen (human, lags the audio)'), q(`azure:${meta.key}`), '', '', '', '', q(meta.key)].join(',')}\n`);
  const { loadDataset } = require('./sangat-score');
  return { ds: loadDataset(root), lines: lines.length, shabads: shabads.length };
}

// ------------------------------------------------------------------------- one session --
async function runOne(spec) {
  const build = path.resolve(arg('build', DEFAULT_BUILD));
  if (!fs.existsSync(path.join(build, 'www/main/addons/voice-follow/components/VoiceFollow.jsx'))) throw new Error(`--build ${build} is not an STTM worktree`);
  const commit = execFileSync('git', ['-C', build, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const feature = (() => { try { return /VF_FEATURE_VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(build, 'www/main/addons/voice-follow/shadow/config.js'), 'utf8'))[1]; } catch (_) { return null; } })();
  const t0 = Date.now();
  const { dir, key, downloaded } = await fetchSession(spec);
  const sj = readJson(path.join(dir, 'session.json'), {});
  const { classify } = require('./gab-harvest');
  const who = /^raw\//.test(key) ? classify(key, sj) : { who: 'local', why: 'local folder' };
  const gurdwara = (sj.tester && sj.tester.gurdwara) || (key.split('/')[1] || '').replace(/-/g, ' ') || 'unknown';
  const slug = `${(key.split('/')[1] || 'local').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${String(sj.id || path.basename(dir)).replace(/[^0-9TZ-]/g, '').slice(0, 19)}`;
  const OUT = outRoot();
  const work = path.join(HOME_ROOT, 'work', `run-${slug}`);
  fs.mkdirSync(work, { recursive: true });
  const reportFile = path.join(OUT, 'reports', `${slug}.json`);
  console.log(`\n== ${key} [${who.who}: ${who.why}] -> ${slug}`);

  // 2. stitch
  const st = stitch(dir, path.join(work, 'session.wav'));
  console.log(`  stitched ${st.segments.length} audio file(s): ${mmss(st.seconds)} on the session clock (${st.segments.filter((s) => s.gap_before_s > 1).length} gaps > 1 s, ${r1(st.segments.reduce((a, s) => a + s.gap_before_s, 0))} s silence filled)`);

  // 3. replay (cached: the model runs only for windows not yet in the emissions cache)
  const eventsFile = path.join(work, 'replay.events.jsonl');
  const cacheId = `shadower-${crypto.createHash('sha1').update(key).digest('hex').slice(0, 12)}`;
  const tr = Date.now();
  const rep = flag('reuse') && fs.existsSync(`${eventsFile}.done.json`) ? readJson(`${eventsFile}.done.json`, {}) : await replay({ wav: st.wav, eventsFile, cacheId, build });
  const replayWall = flag('reuse') && rep.wall_s != null && (Date.now() - tr) < 5000 ? rep.wall_s : (Date.now() - tr) / 1000;
  const rev = jsonl(eventsFile);
  console.log(`  replay: ${mmss(rep.audio_s)} audio in ${replayWall.toFixed(0)} s wall (${(replayWall / (rep.audio_s / 3600) / 60).toFixed(1)} min per hour of audio); ${rev.filter((e) => e.type === 'shabad').length} Shabad changes, ${rev.filter((e) => e.type === 'component-error').length} errors`);
  const system = systemRows(rev);
  const activity = activityRows(st.wav, rev);
  fs.writeFileSync(path.join(work, 'system.offline.jsonl'), system.map((r) => JSON.stringify(r)).join('\n') + '\n');

  // 4. score. basis 'sevadaar': only screen changes the sevadaar made are labels (the prod case: no model on the PC);
  // basis 'screen': every screen change, including ones the live Autopilot made (experimental sessions it drove)
  const human = markAutopilotMade(jsonl(path.join(dir, 'human.jsonl')).sort((a, b) => a.t - b.t), jsonl(path.join(dir, 'system.jsonl')).sort((a, b) => a.t - b.t));
  const events = jsonl(path.join(dir, 'events.jsonl'));
  const SS = shadowScore();
  const sPerAll = SS.perSecond(system, Math.ceil(st.seconds) + 1, true);
  const traceFile = path.join(work, 'side', 'real', 'trace', `${slug}.events.jsonl`);
  fs.mkdirSync(path.dirname(traceFile), { recursive: true });
  fs.writeFileSync(traceFile, rev.filter((e) => ['shabad', 'verse', 'seeking'].includes(e.type)).map((e) => JSON.stringify(e)).join('\n') + '\n');
  const scoreBasis = (basis) => {
    const hum = basis === 'sevadaar' ? human : human.map((h) => ({ ...h, byAutopilot: false }));
    const sh = SS.scoreTimelines({ human: hum, system, activity, events: scoringEvents(events, hum) });
    const length = sh.states.length;
    const hPer = SS.perSecond(hum, length, false);
    const perSec = sh.states.map((state, s) => {
      const h = hPer[s] || {};
      const k = SS.contentKey(h);
      return { state, scored: state === 'kirtan', key: k, verse: k && h.verseId !== '' && h.verseId != null ? Number(h.verseId) : null };
    });
    const id = basis === 'sevadaar' ? slug : `${slug}--screen`;
    const dsRoot = path.join(work, `gab-dataset-${basis}`);
    fs.rmSync(dsRoot, { recursive: true, force: true });
    const gds = gabDataset(dsRoot, id, { gurdwara, dur: length, key }, perSec);
    const tf = path.join(work, 'side', 'real', 'trace', `${id}.events.jsonl`);
    if (tf !== traceFile) fs.copyFileSync(traceFile, tf);
    const sv = require('./sangat-score');
    const row = gds.ds.find(id);
    let gab = null;
    let timeline = null;
    let finds = [];
    if (gds.lines || gds.shabads) {
      const sc = sv.scoreClip(gds.ds, row, tf, { blankIsScored: true });
      const L = sc.line && sc.line.summary;
      const S = sc.shabad && sc.shabad.summary;
      finds = sv.findEvents(gds.ds, row, tf);
      const tl = require('./gab-timeline').build({ sv, ds: gds.ds, card: { gab: 'GAB real sessions', set: 'real', split: 'real', build: { commit }, clips: [{ id, pangti_basis: 'human' }] }, sideDir: path.join(work, 'side'), label: null });
      if (tl && tl.clips[0]) {
        const c = tl.clips[0];
        const tot = c.n.P + c.n.A + c.n.S + c.n.W + c.n.N;
        if (tot) {
          gab = {
            scored_min: r1(tot / 60),
            right_pangti_pct: r1(100 * c.n.P / tot), right_shabad_other_pangti_pct: r1(100 * (c.n.A + c.n.S) / tot), right_shabad_pct: r1(100 * (c.n.P + c.n.A + c.n.S) / tot),
            wrong_shabad_pct: r1(100 * c.n.W / tot), nothing_pct: r1(100 * c.n.N / tot), wrong_shabad_s_per_h: r1(c.n.W / (tot / 3600)),
            sangat_sees_right_pangti_pct: L ? L.right_pct : null, catch_up_lag_p50_s: L ? L.lag_p50 : null, catch_up_lag_p90_s: L ? L.lag_p90 : null,
            line_wrong_s_per_h: L ? L.wrong_s_per_h : null, shabad_level_right_pct: S ? S.right_pct : null, collar_1s_pct: c.kb,
          };
          c.gurdwara = gurdwara;
          c.session = `${(sj.startedAt || '').slice(0, 16).replace('T', ' ')}${basis === 'screen' ? ' · screen made by the live Autopilot' : ''}`;
          c.basis_note = basis;
          timeline = { ...tl, clips: [c] };
        }
      }
    }
    sv.close();
    const q = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : null);
    const firstFind = finds.find((f) => f.kind === 'cold' || f.kind === 'begins');
    const sw = finds.filter((f) => f.kind === 'switch' && !f.parmaan);
    const swFound = sw.filter((f) => f.find != null).map((f) => f.find).sort((a, b) => a - b);
    const shSum = SS.summarize(sh.score);
    return {
      sh, perSec, timeline,
      out: {
        minutes: { kirtan_scored: r1(sh.score.kirtan / 60), held_no_words: r1(sh.score.held / 60), idle_no_gurbani: r1(sh.score.idle / 60), not_scored_autopilot_screen_or_gap: r1(sh.score.paused / 60) },
        gab,
        shadow_score: { ...shSum, cold_find_s: sh.score.coldDelays, switch_delays_s: sh.score.switchDelays, line_delays_p50_s: q(sh.score.lineDelays, 0.5), model_switches: sh.score.modelSwitches, model_switches_right: sh.score.modelSwitchesRight },
        find: { first: firstFind || null, switches: sw.length, switches_found: swFound.length, switch_find_p50_s: q(swFound, 0.5), switch_find_p90_s: q(swFound, 0.9), events: finds },
        listen: sh.listen.slice().sort((a, b) => b.seconds - a.seconds).slice(0, 15).map((x) => ({ ...x, azure: /^raw\//.test(key) && x.audio ? `${key}/${x.audio.file}` : null })),
      },
    };
  };
  const B = scoreBasis('sevadaar');
  const BS = human.some((h) => h.byAutopilot) ? scoreBasis('screen') : null;
  const { sh, perSec } = B;
  const sPer = sPerAll;
  // offline replay vs what the live Autopilot showed (experimental sessions): replay fidelity
  const liveSys = jsonl(path.join(dir, 'system.jsonl'));
  let fid = null;
  if (liveSys.length) {
    const length = sh.states.length;
    const lPer = SS.perSecond(liveSys, length, true);
    let n = 0; let same = 0; let sameV = 0;
    for (let s = 0; s < length; s++) { const a = SS.contentKey(sPer[s]); const b = SS.contentKey(lPer[s]); if (!a && !b) continue; n++; if (a === b) { same++; if ((sPer[s].verseId ?? null) === (lPer[s].verseId ?? null)) sameV++; } }
    fid = { seconds: n, same_content_pct: n ? r1(100 * same / n) : null, same_pangti_pct: n ? r1(100 * sameV / n) : null };
  }
  const timeline = B.timeline || (BS && BS.timeline);

  // 5b. training rows: one per pangti the sevadaar chose while words were heard
  const train = trainingRows({ dir, slug, sj, human, perSec, sPer, wav: st.wav, OUT, SS });

  const labelBasis = (() => {
    const g = human.filter((h) => SS.contentKey(h));
    const ap = g.filter((h) => h.byAutopilot).length;
    return { screen_changes: g.length, by_sevadaar: g.length - ap, by_autopilot: ap };
  })();
  const report = {
    shadower_offline: 1,
    session: key, slug, gurdwara, who: who.who, date: (sj.startedAt || '').slice(0, 10), started_at: sj.startedAt || null,
    recorded_by: { app: sj.app || null, feature: sj.feature || null, collector: sj.collector || null, inference_on_device: sj.inference ?? null, cpu: sj.machine ? sj.machine.cpuModel : null },
    replayed_build: { root: build, commit: commit.slice(0, 12), feature_version: feature },
    audio: { seconds: st.seconds, minutes: r1(st.seconds / 60), files: st.segments.length, silence_filled_s: r1(st.segments.reduce((a, s) => a + s.gap_before_s, 0)), segments: st.segments },
    label_basis: labelBasis,
    ...B.out,
    whole_screen: BS ? { note: 'every screen change as a label, including the ones the live Autopilot made (not human labels: the sevadaar only let them stand)', ...BS.out } : null,
    offline_vs_live_autopilot: fid,
    training: train.counts,
    caveats: [
      'The answer key is the sevadaar\'s screen: people click after they hear a pangti, so "behind", catch-up lag and switch delay include the sevadaar\'s own delay (a few seconds), and a pangti Autopilot shows before the sevadaar clicks reads as "ahead"/"right Shabad, other pangti".',
      'Only seconds with Gurbani the sevadaar chose and words heard (offline loudness + letters) are scored; screen changes the live Autopilot made (experimental sessions where it drove the screen) are not human labels and are left out.',
      'The replay is deterministic (every decision completes before the next audio chunk); a slow Gurdwara Sahib PC can lag more live.',
    ],
    run: { wall_s: r1((Date.now() - t0) / 1000), replay_wall_s: r1(replayWall), replay_min_per_audio_h: r1(replayWall / (rep.audio_s / 3600) / 60), at: new Date().toISOString() },
  };
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 1));
  if (timeline) { fs.mkdirSync(path.join(OUT, 'timeline'), { recursive: true }); fs.writeFileSync(path.join(OUT, 'timeline', `${slug}.json`), JSON.stringify(timeline)); }
  console.log(`  ${report.audio.minutes} min audio; label basis: ${labelBasis.by_sevadaar} sevadaar / ${labelBasis.by_autopilot} Autopilot-made screen changes`);
  for (const [nm, b] of [['sevadaar clicks', B], ['whole screen', BS]]) {
    if (!b) continue;
    const g = b.out.gab;
    const ss = b.out.shadow_score;
    console.log(`  [${nm}] scored ${b.out.minutes.kirtan_scored} min${g ? ` | per second: right pangti ${g.right_pangti_pct}% | right Shabad ${g.right_shabad_pct}% | wrong Shabad ${g.wrong_shabad_pct}% (${g.wrong_shabad_s_per_h} s/h) | nothing ${g.nothing_pct}%` : ''} | shadow: Shabad agreement ${ss.successPct ?? '-'}%, pangti ${ss.lineSuccessPct ?? '-'}%, switches found ${ss.foundPct ?? '-'}% (${ss.switches}), median delay ${ss.medianDelayS ?? '-'} s`);
  }
  if (fid) console.log(`  offline replay = live Autopilot on ${fid.same_content_pct}% of seconds (same pangti ${fid.same_pangti_pct}%)`);
  console.log(`  training rows: ${train.counts.silver} silver, ${train.counts.needs_check} needs-check (${train.counts.autopilot_made_skipped} Autopilot-made screens skipped) -> ${train.dir}`);
  console.log(`  report ${reportFile}`);
  // tidy: downloaded audio and the stitched wav are temporary
  if (!flag('keep-audio')) {
    fs.rmSync(work, { recursive: true, force: true });
    if (downloaded.length && /^raw\//.test(key)) fs.rmSync(dir, { recursive: true, force: true });
  }
  return report;
}

// one folder per pangti: <ts>/<ts>.wav + <ts>/<ts>.csv (verseId,timestamp_seconds), Jaspal's layout; rows.csv lists them
function trainingRows({ dir, slug, sj, human, perSec, sPer, wav, OUT, SS }) {
  const tdir = path.join(OUT, 'training', slug);
  fs.rmSync(tdir, { recursive: true, force: true });
  const counts = { silver: 0, needs_check: 0, autopilot_made_skipped: 0, seconds_silver: 0, seconds_needs_check: 0 };
  const startMs = sj.t0 || Date.parse(sj.startedAt || '') || 0;
  const len = perSec.length;
  const total = (fs.statSync(wav).size - 44) / 2;
  const fd = fs.openSync(wav, 'r');
  const rows = [];
  const hs = human.filter((h) => SS.contentKey(h) && h.verseId != null && h.verseId !== '');
  for (let i = 0; i < hs.length; i++) {
    const h = hs[i];
    const a = h.t;
    const nxt = human.find((x) => x.t > a + 1e-6 && !(SS.contentKey(x) === SS.contentKey(h) && String(x.verseId) === String(h.verseId)));
    const b = Math.min(nxt ? nxt.t : len, a + ROW_MAX_S);
    if (b - a < ROW_MIN_S) continue;
    // only seconds that are scored (words heard, the sevadaar's own choice)
    const secs = [];
    for (let s = Math.floor(a); s < Math.min(len, Math.ceil(b)); s++) secs.push(s);
    const scored = secs.filter((s) => perSec[s] && perSec[s].scored);
    if (h.byAutopilot) { counts.autopilot_made_skipped++; continue; }
    if (scored.length < 0.6 * secs.length) continue;
    const v = Number(h.verseId);
    const key = SS.contentKey(h);
    let agree = 0;
    for (const s of secs) {
      let ok = false;
      for (let m = Math.max(0, s - AGREE_TOL_S); m <= Math.min(len - 1, s + AGREE_TOL_S) && !ok; m++) if (sPer[m] && Number(sPer[m].verseId) === v && SS.contentKey(sPer[m])) ok = true;
      if (ok) agree++;
    }
    const frac = agree / secs.length;
    const conf = frac >= SILVER_MIN ? 'silver' : 'needs-check';
    const from = Math.max(0, a - ROW_LEAD_S);
    const lead = a - from;
    const ts = new Date(startMs + from * 1000).toISOString().replace(/[:.]/g, '-');
    const rd = path.join(tdir, ts);
    fs.mkdirSync(rd, { recursive: true });
    const n0 = Math.round(from * SR);
    const n1 = Math.min(total, Math.round(b * SR));
    const data = Buffer.alloc((n1 - n0) * 2);
    fs.readSync(fd, data, 0, data.length, 44 + n0 * 2);
    const hdr = Buffer.alloc(44);
    hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22);
    hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 2, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
    fs.writeFileSync(path.join(rd, `${ts}.wav`), Buffer.concat([hdr, data]));
    const prev = i > 0 && hs[i - 1].t >= from - 30 ? hs[i - 1].verseId : null;
    fs.writeFileSync(path.join(rd, `${ts}.csv`), `verseId,timestamp_seconds\n${lead > 0 && prev != null ? `${prev},0.000\n` : ''}${v},${lead.toFixed(3)}\n`);
    rows.push({ id: ts, verseId: v, content: key, session_start_s: +from.toFixed(3), click_s: +a.toFixed(3), end_s: +b.toFixed(3), seconds: +(b - from).toFixed(2), lead_s: +lead.toFixed(2), confidence: conf, model_agree: +frac.toFixed(2) });
    if (conf === 'silver') { counts.silver++; counts.seconds_silver += b - from; } else { counts.needs_check++; counts.seconds_needs_check += b - from; }
  }
  fs.closeSync(fd);
  counts.seconds_silver = r1(counts.seconds_silver);
  counts.seconds_needs_check = r1(counts.seconds_needs_check);
  if (rows.length) {
    const cols = Object.keys(rows[0]);
    fs.writeFileSync(path.join(tdir, 'rows.csv'), `${cols.join(',')}\n${rows.map((r) => cols.map((c) => r[c]).join(',')).join('\n')}\n`);
    fs.writeFileSync(path.join(tdir, 'README.md'), [`# Shadower candidate training rows: ${slug}`, '',
      `Source: Azure ${sj.id || ''} (sevadaar screen + diwan audio). One folder per pangti the sevadaar showed while words were heard, in the layout of push_sttm_desktop_recording.py: <ts>/<ts>.wav (16 kHz mono PCM16) and <ts>/<ts>.csv (verseId,timestamp_seconds from the start of the slice; the slice starts ${ROW_LEAD_S} s before the click, labelled with the pangti before it, because the sevadaar clicks after the pangti begins).`, '',
      `confidence: silver = the offline speech model + Voice Autopilot showed the same pangti for >= ${SILVER_MIN * 100}% of the slice (within ${AGREE_TOL_S} s); needs-check = it did not (a person listens before use). Not uploaded anywhere.`, ''].join('\n'));
  } else fs.rmSync(tdir, { recursive: true, force: true });
  return { counts, dir: rows.length ? tdir : '(none)' };
}

// ------------------------------------------------------------------------- summary --
function summary() {
  const OUT = outRoot();
  const date = arg('date', null);
  const reps = fs.existsSync(path.join(OUT, 'reports')) ? fs.readdirSync(path.join(OUT, 'reports')).filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(OUT, 'reports', f), null)).filter(Boolean) : [];
  const sel = reps.filter((r) => !date || r.date === date || (r.run && r.run.at.slice(0, 10) === date)).sort((a, b) => a.started_at.localeCompare(b.started_at));
  const outside = sel.filter((r) => r.who !== 'developer');
  const sumH = (rs, f) => rs.reduce((a, r) => a + (f(r) || 0), 0) / 60;
  const by = new Map();
  for (const r of sel) { if (!by.has(r.gurdwara)) by.set(r.gurdwara, []); by.get(r.gurdwara).push(r); }
  const pct = (n, d) => (d ? `${(100 * n / d).toFixed(1)}%` : '-');
  const agg = (rs) => {
    let P = 0; let S = 0; let W = 0; let T = 0;
    for (const r of rs) { if (!r.gab) continue; const t = r.gab.scored_min * 60; T += t; P += t * r.gab.right_pangti_pct / 100; S += t * r.gab.right_shabad_pct / 100; W += t * r.gab.wrong_shabad_pct / 100; }
    return { T, P, S, W };
  };
  const L = [];
  L.push(`# Shadower daily summary${date ? `: ${date}` : ''}`, '');
  L.push(`Sessions processed: ${sel.length} (${outside.length} real sangat, ${sel.length - outside.length} developer). Audio: ${sumH(sel, (r) => r.audio.minutes).toFixed(2)} h; scored (Gurbani the sevadaar chose, words heard): ${sumH(sel, (r) => r.minutes.kirtan_scored).toFixed(2)} h. Replayed with Voice Autopilot ${[...new Set(sel.map((r) => `${r.replayed_build.feature_version} (${r.replayed_build.commit.slice(0, 8)})`))].join(', ')}.`, '');
  L.push('| Gurdwara Sahib | sessions | audio h | scored h | right pangti | right Shabad | wrong Shabad s/h |', '|---|---|---|---|---|---|---|');
  for (const [g, rs] of [...by.entries()].sort((a, b) => sumH(b[1], (r) => r.audio.minutes) - sumH(a[1], (r) => r.audio.minutes))) {
    const a = agg(rs);
    L.push(`| ${g} | ${rs.length} | ${sumH(rs, (r) => r.audio.minutes).toFixed(2)} | ${(a.T / 3600).toFixed(2)} | ${pct(a.P, a.T)} | ${pct(a.S, a.T)} | ${a.T ? Math.round(a.W / (a.T / 3600)) : '-'} |`);
  }
  const all = agg(sel);
  L.push(`| **all** | ${sel.length} | ${sumH(sel, (r) => r.audio.minutes).toFixed(2)} | ${(all.T / 3600).toFixed(2)} | ${pct(all.P, all.T)} | ${pct(all.S, all.T)} | ${all.T ? Math.round(all.W / (all.T / 3600)) : '-'} |`, '');
  const tr = sel.reduce((a, r) => ({ s: a.s + r.training.silver, n: a.n + r.training.needs_check, ss: a.ss + r.training.seconds_silver, ns: a.ns + r.training.seconds_needs_check }), { s: 0, n: 0, ss: 0, ns: 0 });
  L.push(`Training rows (local only, Jaspal's layout): ${tr.s} silver (${(tr.ss / 60).toFixed(1)} min), ${tr.n} needs-check (${(tr.ns / 60).toFixed(1)} min).`, '');
  const lis = sel.flatMap((r) => r.listen.map((x) => ({ ...x, r }))).filter((x) => x.kind === 'wrong' || x.kind === 'none').sort((a, b) => b.seconds - a.seconds).slice(0, 10);
  if (lis.length) {
    L.push('## Listen first (longest disagreements)', '', '| Gurdwara Sahib | session time | seconds | what | sevadaar | Autopilot (offline) | audio file @ offset |', '|---|---|---|---|---|---|---|');
    for (const x of lis) L.push(`| ${x.r.gurdwara} | ${x.r.started_at.slice(0, 16).replace('T', ' ')} +${x.from} | ${x.seconds} | ${x.kind === 'none' ? 'nothing shown' : 'wrong Shabad'} | ${x.human} | ${x.system || '(nothing)'} | ${x.audio ? `${x.audio.file} @ ${x.audio.offset}` : '-'} |`);
    L.push('');
  }
  L.push('Caveat: the answer key is the sevadaar\'s screen, which lags the audio (people click after they hear the pangti); seconds the live Autopilot drove the screen are not human labels and are not scored.');
  const file = path.join(OUT, 'daily', `${date || 'all'}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${L.join('\n')}\n`);
  console.log(L.join('\n'));
  console.log(`\n-> ${file}`);
}

// ------------------------------------------------------------------------- publish (timeline page only) --
async function publishTimeline() {
  const OUT = outRoot();
  const SPACE = 'khalisfoundation/GAB-leaderboard';
  const { push, hfText } = require('./gab-publish');
  const files = fs.existsSync(path.join(OUT, 'timeline')) ? fs.readdirSync(path.join(OUT, 'timeline')).filter((f) => f.endsWith('.json')) : [];
  const tls = files.map((f) => readJson(path.join(OUT, 'timeline', f), null)).filter(Boolean);
  if (!tls.length) throw new Error('no session timelines yet (shadower-offline run ...)');
  // one "version" per replayed build: every session it replayed is one clip
  const byCommit = new Map();
  for (const t of tls) { const k = String(t.commit).slice(0, 8); if (!byCommit.has(k)) byCommit.set(k, []); byCommit.get(k).push(t); }
  const S = fs.mkdtempSync(path.join(os.tmpdir(), 'shadower-pub-'));
  const ops = [];
  const idx = JSON.parse(await hfText('space', SPACE, 'timeline/index.json') || '{"tiers":[]}');
  let tier = idx.tiers.find((x) => x.key === 'real');
  if (!tier) { tier = { key: 'real', title: 'Real sessions (answer key = the sevadaar\'s screen, lags the audio)', builds: [] }; idx.tiers.push(tier); }
  const reps = fs.readdirSync(path.join(OUT, 'reports')).map((f) => readJson(path.join(OUT, 'reports', f), null)).filter(Boolean);
  for (const [commit, list] of byCommit) {
    const texts = [];
    const tIdx = new Map();
    const T = (s) => { if (s == null) return -1; if (!tIdx.has(s)) { tIdx.set(s, texts.length); texts.push(s); } return tIdx.get(s); };
    const clips = [];
    for (const t of list) for (const c of t.clips) clips.push({ ...c, id: `${c.gurdwara} ${c.session || ''}`.trim(), runs: c.runs.map(([s, e, k, ti, si]) => [s, e, k, T(t.texts[ti] ?? null), T(t.texts[si] ?? null)]) });
    clips.sort((a, b) => String(a.session).localeCompare(String(b.session)));
    const rep = reps.find((r) => r.replayed_build.commit.startsWith(commit));
    const file = `real-sessions-${commit}.json`;
    fs.writeFileSync(path.join(S, file), JSON.stringify({ gab: 'GAB real sessions', label: null, commit, set: 'real', split: 'real', clips, texts }));
    ops.push([`timeline/${file}`, file]);
    tier.builds = tier.builds.filter((b) => b.file !== file);
    tier.builds.push({ slug: `real-${commit}`, file, label: `Gurbani Autopilot ${rep && rep.replayed_build.feature_version ? rep.replayed_build.feature_version : commit} · replayed offline on real sessions`, commit, note: 'real sessions', order: null, date: new Date().toISOString().slice(0, 10) });
    console.log(`timeline/${file}: ${clips.length} session(s), ${(clips.reduce((a, c) => a + c.dur, 0) / 3600).toFixed(2)} h`);
  }
  fs.writeFileSync(path.join(S, 'timeline-index.json'), JSON.stringify(idx, null, 1));
  ops.push(['timeline/index.json', 'timeline-index.json']);
  // the page itself is not touched: the Real sessions set is only data (timeline/<file> + timeline/index.json)
  if (flag('dry-run')) { console.log(`dry run: would commit ${ops.map((o) => o[0]).join(', ')} to ${SPACE} (visibility unchanged)`); return; }
  console.log(push(SPACE, 'space', ops, 'Real sessions: Shadower offline replay timelines', S));
  fs.rmSync(S, { recursive: true, force: true });
}

// ------------------------------------------------------------------------- list --
async function list() {
  const { classify } = require('./gab-harvest');
  const blobs = await listPrefix('raw/');
  const sess = new Map();
  for (const b of blobs) {
    const m = b.name.match(/^(raw\/[^/]+\/[^/]+\/[^/]+\/[^/]+)\/([^/]+)$/);
    if (!m) continue;
    if (!sess.has(m[1])) sess.set(m[1], { key: m[1], bytes: 0, audio: 0, files: 0 });
    const s = sess.get(m[1]);
    s.files++; s.bytes += b.size; if (/^audio-/.test(m[2])) s.audio += b.size;
  }
  const rows = [...sess.values()].map((s) => ({ ...s, c: classify(s.key, {}) })).sort((a, b) => (a.c.who === 'outside' ? 0 : 1) - (b.c.who === 'outside' ? 0 : 1) || b.key.localeCompare(a.key));
  console.log('| session | who | audio (approx. min at 16 kHz wav) |\n|---|---|---|');
  for (const r of rows) console.log(`| ${r.key} | ${r.c.who} | ${(r.audio / 32000 / 60).toFixed(1)} |`);
}

async function main(args) {
  A = args;
  if (A[0] === '--replay-child') return replayChild(A.slice(1));
  const cmd = A[0];
  if (cmd === 'summary') return summary();
  if (cmd === 'publish-timeline') return publishTimeline();
  if (cmd === 'list') return list();
  const specs = (cmd === 'run' ? A.slice(1) : A).filter((x, i, arr) => !x.startsWith('--') && !(i > 0 && ['--build', '--out'].includes(arr[i - 1])));
  if (!specs.length) { console.error('usage: shadower-offline run <session dir | raw/<gurdwara>/<tester>/<date>/<session>> [...] [--build <worktree>] [--out <dir>] [--keep-audio] [--no-cache]\n       shadower-offline summary [--date YYYY-MM-DD] | publish-timeline [--dry-run] | list'); process.exit(2); }
  for (const s of specs) {
    try { await runOne(s); } catch (e) { console.error(`  ${s}: FAILED ${redact(e.stack || e)}`); process.exitCode = 1; }
  }
}
module.exports = { main, stitch, placements, systemRows, activityRows, markAutopilotMade, scoringEvents };
if (require.main === module) main(process.argv.slice(2)).catch((e) => { console.error(redact(e.stack || e)); process.exit(2); });
