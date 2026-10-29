// remote-cache.js — the shared copy of the emissions cache in Khalis's Azure Blob container
// (banidb / voice-follow-training-data, prefix bench-cache/). See REPLAY.md "Shared cache".
//
// Layout: bench-cache/<model sha12>/<codec>/<audio sha256>.bin        (emis.bin of one clip)
//         bench-cache/<model sha12>/<codec>/<audio sha256>.index.jsonl (its window index)
//         bench-cache/manifest.json  {entries: {"<model>/<codec>/<audio sha>": {clip, sha256, model, codec,
//                                     size, indexSize, windows, recordedAt, recordedOn}}}
// Entries hold CTC log-probs keyed by sha1(window samples): no audio, nothing an audio file can be
// rebuilt from, no secrets. The SAS (racwl, no delete) comes from env VF_AZURE_SAS or ~/.vf-azure-sas
// and is never printed: every URL in an error is redacted.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const BASE = 'https://banidb.blob.core.windows.net/voice-follow-training-data';
const PREFIX = 'bench-cache';
// st / se are plain timestamps (not secret); a hand-edited copy can lose a '-' or ':' (seen Oct 15 2026):
// rebuild them from their 14 digits as YYYY-MM-DDTHH:MM:SSZ, which is the exact form Azure signed
const fixTimes = (s) => s.split('&').map((p) => { const m = p.match(/^(st|se)=(.*)$/); if (!m) return p; const d = decodeURIComponent(m[2]).replace(/\D/g, ''); return d.length === 14 ? `${m[1]}=${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(8, 10)}:${d.slice(10, 12)}:${d.slice(12, 14)}Z` : p; }).join('&');
function sas() {
  const s = (process.env.VF_AZURE_SAS || (() => {
    try { return fs.readFileSync(path.join(os.homedir(), '.vf-azure-sas'), 'utf8'); } catch (_) { return ''; }
  })()).replace(/\s+/g, '').replace(/^['"]+|['"]+$/g, '').replace(/^[^?]*\?/, '').replace(/%$/, ''); // a pasted copy may carry spaces, quotes, the whole URL or zsh's end-of-line % mark: keep the query only
  if (!s) throw new Error('no SAS: set VF_AZURE_SAS or create ~/.vf-azure-sas (mode 600)');
  return fixTimes(s);
}
const redact = (s) => String(s).replace(/sig=[^&\s"']+/g, 'sig=REDACTED').replace(/\?[^\s"']*se=[^\s"']*/g, '?<sas>');
const url = (key, q = '') => `${BASE}/${key.split('/').map(encodeURIComponent).join('/')}?${q ? `${q}&` : ''}${sas()}`;

async function request(method, key, { body, headers = {}, q } = {}) {
  let res;
  try {
    res = await fetch(url(key, q), { method, body, headers });
  } catch (e) {
    throw new Error(`${method} ${key}: ${redact(e.message)}`);
  }
  if (!res.ok && res.status !== 404) throw new Error(`${method} ${key}: HTTP ${res.status} ${redact((await res.text()).slice(0, 200))}`);
  return res;
}

async function put(key, buf, type = 'application/octet-stream') {
  await request('PUT', key, { body: buf, headers: { 'x-ms-blob-type': 'BlockBlob', 'content-type': type, 'content-length': String(buf.length) } });
}
async function get(key) {
  const res = await request('GET', key);
  if (res.status === 404) return null;
  return Buffer.from(await res.arrayBuffer());
}
// name -> size of every blob under bench-cache/
async function list() {
  const out = new Map();
  let marker = '';
  for (;;) {
    const res = await fetch(`${BASE}?restype=container&comp=list&prefix=${PREFIX}/${marker ? `&marker=${encodeURIComponent(marker)}` : ''}&${sas()}`);
    if (!res.ok) throw new Error(`list: HTTP ${res.status}`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<Blob>[\s\S]*?<Name>([^<]+)<\/Name>[\s\S]*?<Content-Length>(\d+)<\/Content-Length>[\s\S]*?<\/Blob>/g)) out.set(m[1], Number(m[2]));
    const nm = xml.match(/<NextMarker>([^<]*)<\/NextMarker>/);
    if (!nm || !nm[1]) return out;
    marker = nm[1];
  }
}

const shaMemo = new Map();
function audioSha(wav) {
  if (!shaMemo.has(wav)) shaMemo.set(wav, crypto.createHash('sha256').update(fs.readFileSync(wav)).digest('hex'));
  return shaMemo.get(wav);
}

// clips: [{ id, wav }] (from vf-suites jobs). Local store: <root>/<model>-<codec>/<id>/{emis.bin,index.jsonl}
function localEntries(root, model, codec, clips) {
  const dir = path.join(root, `${model}-${codec}`);
  const out = [];
  for (const c of clips) {
    const d = path.join(dir, c.id);
    const bin = path.join(d, 'emis.bin');
    const idx = path.join(d, 'index.jsonl');
    if (!fs.existsSync(bin) || !fs.existsSync(idx) || !fs.existsSync(c.wav)) continue;
    out.push({ ...c, dir: d, bin, idx, sha: audioSha(c.wav), size: fs.statSync(bin).size, indexSize: fs.statSync(idx).size });
  }
  return out;
}

// platform provenance of a local entry (vf-check.js writes provenance.json; none = recorded on the Mac before the
// stamp existed): pushed into the manifest entry, and written back next to a pulled entry
function provenanceOf(dir) {
  try { const p = JSON.parse(fs.readFileSync(path.join(dir, 'provenance.json'), 'utf8')); return { platform: p.platform, cpu: p.cpu || null, host: p.host || null }; } catch (_) { return { platform: 'darwin-arm64' }; }
}

async function push({ root, model, codec, clips, commit, log = console.log }) {
  const remote = await list();
  const manKey = `${PREFIX}/manifest.json`;
  const manBuf = await get(manKey);
  const man = manBuf ? JSON.parse(manBuf.toString('utf8')) : { entries: {} };
  let bytes = 0;
  let n = 0;
  for (const e of localEntries(root, model, codec, clips)) {
    const k = `${PREFIX}/${model}/${codec}/${e.sha}`;
    // the store is append-only: a larger local file is a newer superset
    if ((remote.get(`${k}.bin`) || 0) >= e.size && (remote.get(`${k}.index.jsonl`) || 0) >= e.indexSize) continue;
    // index first-safe order: bin, then index (a reader only trusts index lines that fit the bin)
    await put(`${k}.bin`, fs.readFileSync(e.bin));
    await put(`${k}.index.jsonl`, fs.readFileSync(e.idx), 'application/x-ndjson');
    const windows = fs.readFileSync(e.idx, 'utf8').split('\n').filter(Boolean).length;
    man.entries[`${model}/${codec}/${e.sha}`] = { clip: e.id, sha256: e.sha, model, codec, size: e.size, indexSize: e.indexSize, windows, recordedAt: fs.statSync(e.bin).mtime.toISOString(), recordedOn: commit || null, ...provenanceOf(e.dir) };
    bytes += e.size + e.indexSize;
    n += 1;
    log(`  pushed ${e.id} (${(e.size / 1e6).toFixed(1)} MB, ${windows} windows)`);
  }
  if (n) await put(manKey, Buffer.from(JSON.stringify(man, null, 1)), 'application/json');
  return { pushed: n, bytes, remoteTotal: [...(await list()).values()].reduce((a, b) => a + b, 0) };
}

// Fetch clips that are missing locally or smaller than the remote copy.
async function pull({ root, model, codec, clips, log = console.log }) {
  const remote = await list();
  let man = null;
  let n = 0;
  let bytes = 0;
  for (const c of clips) {
    if (!fs.existsSync(c.wav)) continue;
    const k = `${PREFIX}/${model}/${codec}/${audioSha(c.wav)}`;
    const rb = remote.get(`${k}.bin`);
    if (!rb) continue;
    const d = path.join(root, `${model}-${codec}`, c.id);
    const bin = path.join(d, 'emis.bin');
    if (fs.existsSync(bin) && fs.statSync(bin).size >= rb) continue;
    const b = await get(`${k}.bin`);
    const i = await get(`${k}.index.jsonl`);
    if (!b || !i) continue;
    fs.mkdirSync(d, { recursive: true });
    // write to temp names, then rename: a half-written pull never looks like a cache
    fs.writeFileSync(`${bin}.part`, b);
    fs.writeFileSync(path.join(d, 'index.jsonl.part'), i);
    fs.renameSync(`${bin}.part`, bin);
    fs.renameSync(path.join(d, 'index.jsonl.part'), path.join(d, 'index.jsonl'));
    try {
      if (man == null) { const mb = await get(`${PREFIX}/manifest.json`); man = mb ? JSON.parse(mb.toString('utf8')) : { entries: {} }; }
      const me = man.entries[`${model}/${codec}/${audioSha(c.wav)}`];
      // the x86 reference namespace (codec *-x86) holds linux-x64 output only, also when its manifest entry is missing
      if (/-x86$/.test(codec) && !(me && me.platform)) fs.writeFileSync(path.join(d, 'provenance.json'), `${JSON.stringify({ platform: 'linux-x64', pulledFrom: 'azure bench-cache (x86 namespace)' }, null, 1)}\n`);
      else if (me && me.platform) fs.writeFileSync(path.join(d, 'provenance.json'), `${JSON.stringify({ platform: me.platform, cpu: me.cpu || null, host: me.host || null, pulledFrom: 'azure bench-cache manifest' }, null, 1)}\n`);
    } catch (_) { /* provenance is advisory on pull */ }
    n += 1;
    bytes += b.length + i.length;
    log(`  pulled ${c.id} (${(b.length / 1e6).toFixed(1)} MB)`);
  }
  return { pulled: n, bytes };
}

module.exports = { push, pull, list, audioSha, redact, fixTimes, PREFIX };
