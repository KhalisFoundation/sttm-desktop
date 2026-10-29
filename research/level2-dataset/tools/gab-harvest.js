/* gab-harvest.js — the GAB flywheel from real usage: Voice-Follow sessions in Azure -> review-queue clips.
 *
 *   gab harvest [--since 2026-10-12] [--include-dev] [--include-unidentified] [--max-per-session 40] [--no-audio]
 *               [--offline] [--session <raw/... path>] [--queue <dir>]
 *   gab harvest --list                 sessions in Azure: outside (non-developer) first, harvested or not
 *   gab harvest --promote [--into <benchmark dir>]   reviewed / overridden items -> benchmark clip folders (staging)
 *
 * Source (read-only): Azure banidb / voice-follow-training-data, raw/<gurdwara>/<tester>/<date>/<session>/ with
 * session.json (tester, app, feature version / commit), human.jsonl (what the sevadaar put on screen; in visible mode
 * each row says override: true when it differs from what Voice-Follow last showed), system.jsonl (what Voice-Follow
 * showed / would show), events.jsonl (vf_visible / vf_hidden, audio_segment t + file), audio-NNN.(wav|webm).
 * SAS from env VF_AZURE_SAS or ~/.vf-azure-sas, never printed. Only list + GET.
 *
 * Who is skipped: developer testers (Arashdeep Singh, Jashandeep Singh, Gauravjeet Singh, incl. "Hardeep Singh -
 * Jashandeep Singh"), test gurdwaras (test / *-mac / jashan-test / asingh02), unless --include-dev; testers with no
 * real name (a, h, unknown) unless --include-unidentified. Audio of a skipped-by-default session is never downloaded
 * unless --audio is also given.
 *
 * What is cut (the sevadaar's screen is a lagging human label):
 *   hidden mode (Voice-Follow running in the background): every stretch where the sevadaar's verse stayed put
 *     >= 6 s; kind = disagree (app showed another verse >= 50% of it), app-blank (app showed nothing >= 50%),
 *     agree (app on the sevadaar's verse >= 80%; sampled, 1 per 4 disagreements).
 *   visible mode (Voice-Follow drives the screen): the screen is mostly the app's own, so only sevadaar OVERRIDES
 *     are labels: kind = override (the verse the sevadaar switched to, held >= 4 s).
 * Each item = a clip from 3 s before the stretch to its end (max 45 s), with both lines, queued for the yes/no ear
 * check (gab review). provenance "sevadaar screen (human, may lag)".
 * Benchmark entry rule: an item enters only after an ear-check answer (sevadaar / app / instrumental), or without one
 * when it is an override (the sevadaar corrected the app). --promote writes those as clip folders in the benchmark
 * layout (lines.csv source "sevadaar-screen" or "ear-check") into a staging dir; the item ids are the review-queue ids.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ACCOUNT = 'https://banidb.blob.core.windows.net/voice-follow-training-data';
const HOME = path.join(os.homedir(), 'personal/live-darbar-venues/gab-harvest');
const SESS = path.join(HOME, 'sessions'); // small files only
const LEDGER = path.join(__dirname, '..', 'gab-harvest', 'harvested.json'); // committed: what was harvested when
const SMALL = ['session.json', 'human.jsonl', 'system.jsonl', 'events.jsonl'];
const DEV_NAMES = /arashdeep|jashandeep|gauravjeet|asingh02/i;
const TEST_PLACES = /test|-mac$|^jashan|asingh02|^panjab$/i;
const STABLE_S = 6;
const OVERRIDE_HOLD_S = 4;
const PRE_S = 3;
const MAX_CLIP_S = 45;
const MIN_FREE_GB = 15;
const FFMPEG = [path.join(os.homedir(), '.local/bin/ffmpeg'), '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'].find((f) => fs.existsSync(f)) || 'ffmpeg';

let A = [];
const flag = (n) => A.includes(`--${n}`);
const arg = (n, d) => { const i = A.indexOf(`--${n}`); return i >= 0 && A[i + 1] && !A[i + 1].startsWith('--') ? A[i + 1] : d; };
const r1 = (x) => +x.toFixed(1);
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return d; } };
const jsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean) : []);

// ---------------------------------------------------------------- Azure (read-only) --
function sas() {
  const s = (process.env.VF_AZURE_SAS || (fs.existsSync(path.join(os.homedir(), '.vf-azure-sas')) ? fs.readFileSync(path.join(os.homedir(), '.vf-azure-sas'), 'utf8') : '')).trim().replace(/^\?/, '');
  if (!s) throw new Error('no SAS: set VF_AZURE_SAS or ~/.vf-azure-sas');
  return s;
}
const blobUrl = (name) => `${ACCOUNT}/${name.split('/').map(encodeURIComponent).join('/')}?${sas()}`;
async function listRaw() {
  const out = [];
  let marker = '';
  for (;;) {
    const r = await fetch(`${ACCOUNT}?restype=container&comp=list&prefix=raw/&maxresults=5000${marker ? `&marker=${encodeURIComponent(marker)}` : ''}&${sas()}`);
    if (!r.ok) throw new Error(`Azure listing HTTP ${r.status}`);
    const xml = await r.text();
    for (const m of xml.matchAll(/<Blob><Name>([^<]*)<\/Name>(.*?)<\/Blob>/g)) {
      const len = /<Content-Length>(\d+)</.exec(m[2]);
      const etag = /<Etag>([^<]*)</i.exec(m[2]);
      out.push({ name: m[1].replace(/&amp;/g, '&'), size: len ? +len[1] : 0, etag: etag ? etag[1] : '' });
    }
    const nm = /<NextMarker>([^<]*)<\/NextMarker>/.exec(xml);
    marker = nm ? nm[1] : '';
    if (!marker) break;
  }
  return out;
}
async function download(name, dst) {
  const r = await fetch(blobUrl(name));
  if (!r.ok) throw new Error(`GET ${name} -> HTTP ${r.status}`);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(`${dst}.part`, Buffer.from(await r.arrayBuffer()));
  fs.renameSync(`${dst}.part`, dst);
}

// sessions = raw/<g>/<t>/<date>/<session>/ folders with a session.json; small files synced (ETag index)
async function syncSessions() {
  const blobs = await listRaw();
  const idx = readJson(path.join(SESS, 'index.json'), {});
  const sessions = new Map();
  for (const b of blobs) {
    const m = b.name.match(/^(raw\/[^/]+\/[^/]+\/[^/]+\/[^/]+)\/([^/]+)$/);
    if (!m || m[1].includes('/undated/')) continue;
    if (!sessions.has(m[1])) sessions.set(m[1], { key: m[1], files: {} });
    sessions.get(m[1]).files[m[2]] = b;
  }
  let fetched = 0;
  for (const s of sessions.values()) {
    for (const f of SMALL) {
      const b = s.files[f];
      if (!b) continue;
      const dst = path.join(SESS, s.key, f);
      if (idx[b.name] === b.etag && fs.existsSync(dst)) continue;
      await download(b.name, dst);
      idx[b.name] = b.etag;
      fetched++;
    }
  }
  fs.mkdirSync(SESS, { recursive: true });
  fs.writeFileSync(path.join(SESS, 'index.json'), JSON.stringify(idx, null, 1));
  return { sessions: [...sessions.values()], fetched };
}
function offlineSessions() {
  const out = [];
  const walk = (d, depth) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const p = path.join(d, e.name);
      if (depth === 4) { if (fs.existsSync(path.join(p, 'session.json'))) out.push({ key: path.relative(SESS, p), files: {} }); } else walk(p, depth + 1);
    }
  };
  walk(path.join(SESS, 'raw'), 1);
  return out;
}

// ---------------------------------------------------------------- who --------------
function classify(key, sj) {
  const [, g, t] = key.split('/');
  const name = (sj.tester && sj.tester.name) || t || '';
  const place = (sj.tester && sj.tester.gurdwara) || g || '';
  if (DEV_NAMES.test(name) || DEV_NAMES.test(t)) return { who: 'developer', why: `tester ${name}` };
  if (TEST_PLACES.test(place) || TEST_PLACES.test(g)) return { who: 'developer', why: `test place ${place || g}` };
  if (name.replace(/[^a-z]/gi, '').length < 3 || /^unknown$/i.test(name)) return { who: 'unidentified', why: `tester "${name}"` };
  return { who: 'outside', why: `${name} @ ${place}` };
}

// ---------------------------------------------------------------- cutting ------------
function timelines(dir) {
  const human = jsonl(path.join(dir, 'human.jsonl')).sort((a, b) => a.t - b.t);
  const sysRows = jsonl(path.join(dir, 'system.jsonl')).sort((a, b) => a.t - b.t);
  const events = jsonl(path.join(dir, 'events.jsonl')).sort((a, b) => a.t - b.t);
  // system: partial updates merged as bus.js does
  let cur = {};
  const sys = sysRows.map((u) => {
    const next = { ...cur, ...u };
    if (u.shabadId != null) { next.slide = null; next.bani = null; }
    if (u.bani != null) { next.slide = null; next.shabadId = null; }
    cur = next;
    return next;
  });
  const vis = [];
  let visible = false;
  for (const e of events) if (e.type === 'vf_visible' || e.type === 'vf_hidden') { visible = e.type === 'vf_visible'; vis.push({ t: e.t, visible }); }
  const segs = events.filter((e) => e.type === 'audio_segment' || e.type === 'pre_roll').map((e) => ({ t: e.type === 'pre_roll' ? e.t - (e.seconds || 0) : e.t, file: e.file }));
  const end = Math.max(0, ...events.map((e) => e.t), ...human.map((e) => e.t));
  return { human, sys, vis, segs, end };
}
const at = (arr, t) => { let v = null; for (const x of arr) { if (x.t > t) break; v = x; } return v; };
const visibleAt = (vis, t) => { const v = at(vis, t); return v ? v.visible : false; };
// fraction of [a, b) the app showed: the same verse / another verse / nothing
function appVs(sys, verse, a, b) {
  let same = 0;
  let other = 0;
  let blank = 0;
  for (let t = a; t < b; t += 0.25) {
    const s = at(sys, t);
    const v = s && !s.slide && s.verseId != null && s.verseId !== '' ? Number(s.verseId) : null;
    if (v == null) blank++; else if (v === verse) same++; else other++;
  }
  const n = same + other + blank || 1;
  const s = at(sys, a + (b - a) / 2);
  return { same: same / n, other: other / n, blank: blank / n, appVerse: s && s.verseId ? Number(s.verseId) : null };
}
function cut(key, dir, { maxItems }) {
  const { human, sys, vis, segs, end } = timelines(dir);
  const items = [];
  // stable sevadaar stretches
  const stretches = [];
  for (let i = 0; i < human.length; i++) {
    const h = human[i];
    const v = h.verseId != null && h.verseId !== '' && !h.slide ? Number(h.verseId) : null;
    if (v == null) continue;
    const b = i + 1 < human.length ? human[i + 1].t : end;
    // merge rows that keep the same verse (bani / ceremony refresh rows)
    const last = stretches[stretches.length - 1];
    if (last && last.verse === v && Math.abs(last.b - h.t) < 0.5) { last.b = b; continue; }
    stretches.push({ verse: v, a: h.t, b, override: !!h.override, prev: i > 0 ? human[i - 1].verseId : null, shabad: h.shabadId });
  }
  const prevVerse = (k) => (k > 0 ? stretches[k - 1].verse : null);
  stretches.forEach((s, k) => {
    const len = s.b - s.a;
    if (visibleAt(vis, s.a + 0.01)) {
      if (!s.override || len < OVERRIDE_HOLD_S) return;
      items.push({ kind: 'override', s, before: prevVerse(k), app: appVs(sys, s.verse, s.a - 2, s.a) });
      return;
    }
    if (len < STABLE_S) return;
    const app = appVs(sys, s.verse, s.a, s.b);
    const kind = app.same >= 0.8 ? 'agree' : app.other >= 0.5 ? 'disagree' : app.blank >= 0.5 ? 'app-blank' : null;
    if (kind) items.push({ kind, s, before: prevVerse(k), app });
  });
  // priority: overrides, disagreements, app-blank, then a sample of agreements (1 per 4 disagreements, at least 1)
  const pri = { override: 0, disagree: 1, 'app-blank': 2, agree: 3 };
  const nDis = items.filter((x) => x.kind === 'disagree').length;
  const agrees = items.filter((x) => x.kind === 'agree');
  const keepAgree = new Set(agrees.filter((_, i) => i % Math.max(1, Math.floor(agrees.length / Math.max(1, Math.ceil(nDis / 4))) ) === 0).slice(0, Math.max(1, Math.ceil(nDis / 4))));
  const chosen = items.filter((x) => x.kind !== 'agree' || keepAgree.has(x)).sort((a, b) => pri[a.kind] - pri[b.kind] || a.s.a - b.s.a).slice(0, maxItems).sort((a, b) => a.s.a - b.s.a);
  return { all: items, chosen, segs };
}

// ---------------------------------------------------------------- audio --------------
function freeBytes(dir) { fs.mkdirSync(dir, { recursive: true }); return Number(execFileSync('df', ['-k', dir], { encoding: 'utf8' }).trim().split('\n').pop().split(/\s+/)[3]) * 1024; }
async function cutAudio(key, segs, files, t0, t1, out, tmp) {
  // the segments overlapping [t0, t1)
  const sorted = [...segs].sort((a, b) => a.t - b.t);
  const need = sorted.filter((s, i) => { const e = i + 1 < sorted.length ? sorted[i + 1].t : Infinity; return s.t < t1 && e > t0; });
  if (!need.length) return false;
  const parts = [];
  for (const s of need) {
    const b = files[s.file];
    if (!b) return false;
    const local = path.join(tmp, key.replace(/\//g, '_'), s.file);
    if (!fs.existsSync(local)) {
      if (freeBytes(tmp) - b.size < MIN_FREE_GB * 1e9) throw new Error(`downloading ${s.file} would leave < ${MIN_FREE_GB} GB free`);
      await download(b.name, local);
    }
    parts.push({ ...s, local });
  }
  // decode each part to 16 kHz mono f32, concatenate, cut
  const pcm = parts.map((p) => execFileSync(FFMPEG, ['-v', 'error', '-i', p.local, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], { maxBuffer: 1 << 30 }));
  const base = parts[0].t;
  const all = Buffer.concat(pcm);
  const from = Math.max(0, Math.round((t0 - base) * 16000)) * 2;
  const to = Math.min(all.length, Math.round((t1 - base) * 16000) * 2);
  if (to <= from) return false;
  const data = all.subarray(from, to);
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22);
  hdr.writeUInt32LE(16000, 24); hdr.writeUInt32LE(32000, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.concat([hdr, data]));
  return true;
}

// ---------------------------------------------------------------- main ---------------
async function harvest() {
  const queue = path.resolve(arg('queue', path.join(HOME, 'queue')));
  const ledger = readJson(LEDGER, { sessions: {} });
  const { sessions, fetched } = flag('offline') ? { sessions: offlineSessions(), fetched: 0 } : await syncSessions();
  const since = arg('since', '');
  const rows = [];
  for (const s of sessions) {
    const dir = path.join(SESS, s.key);
    const sj = readJson(path.join(dir, 'session.json'), {});
    const c = classify(s.key, sj);
    const date = s.key.split('/')[3];
    rows.push({ ...s, dir, sj, c, date, done: !!ledger.sessions[s.key] });
  }
  rows.sort((a, b) => (a.c.who === 'outside' ? 0 : 1) - (b.c.who === 'outside' ? 0 : 1) || b.date.localeCompare(a.date));
  const out = rows.filter((r) => r.c.who === 'outside');
  console.log(`Azure sessions: ${rows.length} (${fetched} small files fetched); outside (non-developer): ${out.length}; developer ${rows.filter((r) => r.c.who === 'developer').length}; unidentified tester ${rows.filter((r) => r.c.who === 'unidentified').length}`);
  if (!out.length) console.log('  no outside sessions yet: every session so far is a developer test or has no real tester name');
  if (flag('list')) {
    console.log('| session | who | why | app / feature | harvested |\n|---|---|---|---|---|');
    for (const r of rows) console.log(`| ${r.key.replace(/^raw\//, '')} | ${r.c.who} | ${r.c.why} | ${r.sj.app || '?'} ${r.sj.feature ? `${r.sj.feature.version}@${r.sj.feature.commit}` : r.sj.build || ''} | ${r.done ? ledger.sessions[r.key].at : '-'} |`);
    return;
  }
  const only = arg('session');
  const pick = rows.filter((r) => (only ? r.key === only || r.key.endsWith(only) : !r.done) && (!since || r.date >= since)
    && (r.c.who === 'outside' || (r.c.who === 'developer' && flag('include-dev')) || (r.c.who === 'unidentified' && flag('include-unidentified'))));
  const items = readJson(path.join(queue, 'items.json'), []);
  const have = new Set(items.map((x) => x.id));
  const sv = require('./sangat-score');
  const tmp = path.join(HOME, 'tmp-audio');
  let added = 0;
  for (const r of pick) {
    const { all, chosen } = cut(r.key, r.dir, { maxItems: Number(arg('max-per-session', 40)) });
    const audioOk = !flag('no-audio') && (r.c.who === 'outside' || flag('audio'));
    const counts = all.reduce((m, x) => ({ ...m, [x.kind]: (m[x.kind] || 0) + 1 }), {});
    console.log(`${r.key.replace(/^raw\//, '')} [${r.c.who}]: ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ') || 'no labelled stretches'}; queueing ${chosen.length}${audioOk ? '' : ' (no audio: developer / unidentified session, or --no-audio)'}`);
    // the session's audio blob list (names only) for cutting
    let files = {};
    if (audioOk && !flag('offline')) { const all2 = (await listRaw()).filter((b) => b.name.startsWith(`${r.key}/`)); files = Object.fromEntries(all2.map((b) => [b.name.slice(r.key.length + 1), b])); }
    const { segs } = timelines(r.dir);
    const sid = crypto.createHash('sha1').update(r.key).digest('hex').slice(0, 6);
    for (const it of chosen) {
      const id = `hv-${sid}-${String(Math.round(it.s.a * 10)).padStart(6, '0')}`;
      if (have.has(id)) continue;
      const t0 = Math.max(0, it.s.a - PRE_S);
      const t1 = Math.min(it.s.b, it.s.a + MAX_CLIP_S - PRE_S);
      const clip = `clips/${id}.wav`;
      let hasAudio = false;
      if (audioOk) { try { hasAudio = await cutAudio(r.key, segs, files, t0, t1, path.join(queue, clip), tmp); } catch (e) { console.log(`  ${id}: audio not cut (${String(e.message).replace(/sig=[^&\s]+/g, 'sig=REDACTED').slice(0, 120)})`); } }
      items.push({ id, set: `Harvest ${r.sj.tester && r.sj.tester.gurdwara || r.key.split('/')[1]}`, recording: r.key, kind: it.kind, mode: it.kind === 'override' ? 'visible' : 'hidden',
        t0: r1(t0), t1: r1(t1), seconds: r1(t1 - t0), marker: r1(it.s.a - t0), duration: r1(t1 - t0), clip: hasAudio ? clip : null,
        sevadaarVerse: it.s.verse, sevadaarLine: sv.textOf(it.s.verse) || `(verse ${it.s.verse})`, sevadaarShabad: it.s.shabad ?? null,
        appVerse: it.app.appVerse, appLine: it.app.appVerse ? sv.textOf(it.app.appVerse) || `(verse ${it.app.appVerse})` : '(nothing on screen)',
        beforeLine: it.before ? sv.textOf(it.before) || '' : '', appShare: { same: r1(100 * it.app.same), other: r1(100 * it.app.other), blank: r1(100 * it.app.blank) },
        override: it.kind === 'override', provenance: 'sevadaar screen (human, may lag)', who: r.c.who,
        app: r.sj.app || null, feature: r.sj.feature || null });
      added++;
    }
    if (!only || flag('mark')) ledger.sessions[r.key] = { at: new Date().toISOString().slice(0, 16), who: r.c.who, counts, queued: chosen.length, audio: audioOk };
    fs.rmSync(path.join(tmp, r.key.replace(/\//g, '_')), { recursive: true, force: true }); // downloaded segments are temporary
  }
  sv.close();
  fs.mkdirSync(queue, { recursive: true });
  fs.writeFileSync(path.join(queue, 'items.json'), JSON.stringify(items, null, 1));
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
  console.log(`queue ${queue}: ${items.length} items (${added} new, ${items.filter((x) => x.clip).length} with audio). Review: gab review --queue ${queue}`);
}

// reviewed or overridden items -> benchmark clip folders (staging); answers from the ear-check app
function promote() {
  const queue = path.resolve(arg('queue', path.join(HOME, 'queue')));
  const into = path.resolve(arg('into', path.join(HOME, 'promoted')));
  const items = readJson(path.join(queue, 'items.json'), []);
  const answers = readJson(path.join(queue, 'answers.json'), {});
  const rows = [];
  for (const it of items) {
    const a = answers[it.id] && answers[it.id].answer;
    // the label: the ear check's answer, else the sevadaar's override
    let verse = null;
    let source = null;
    if (a === 'sevadaar') { verse = it.sevadaarVerse; source = 'ear-check'; } else if (a === 'app') { verse = it.appVerse; source = 'ear-check'; } else if (a === 'instrumental') { verse = it.sevadaarVerse; source = 'ear-check (instruments only: keep the line)'; } else if (!a && it.override) { verse = it.sevadaarVerse; source = 'sevadaar-screen (override)'; }
    if (verse == null || !it.clip) continue;
    const d = path.join(into, '1-kirtan-shabad', it.id);
    fs.mkdirSync(d, { recursive: true });
    fs.copyFileSync(path.join(queue, it.clip), path.join(d, 'audio.wav'));
    fs.writeFileSync(path.join(d, 'lines.csv'), `verseId,start_s,end_s,confidence,source\n${verse},${it.marker},${it.duration},1,human\n`);
    fs.writeFileSync(path.join(d, 'shabads.csv'), `shabadId,start_s,end_s,source\n${it.sevadaarShabad ?? ''},${it.marker},${it.duration},human\n`);
    fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify({ id: it.id, content_folder: '1-kirtan-shabad', origin: `azure:${it.recording}@${it.t0}-${it.t1}`, label_source: source, provenance: it.provenance, kind: it.kind, app: it.app, feature: it.feature }, null, 1));
    rows.push({ id: it.id, source });
  }
  console.log(`promote: ${rows.length} of ${items.length} queue items have a label (ear check, or a sevadaar override) -> ${into}/1-kirtan-shabad/. They need a replay runner (suite) before GAB scores them.`);
}

async function main(args) {
  A = args;
  if (flag('promote')) return promote();
  return harvest();
}
module.exports = { main, classify, cut, timelines, sas, download, ACCOUNT, DEV_NAMES, TEST_PLACES };
if (require.main === module) main(process.argv.slice(2)).catch((e) => { console.error(String(e.stack || e).replace(/sig=[^&\s"']+/g, 'sig=REDACTED')); process.exit(2); });
