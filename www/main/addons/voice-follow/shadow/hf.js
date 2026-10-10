// Second copy of every finished session on Hugging Face, in the layout the team's other
// recordings use (Jaspal's scripts/push_sttm_desktop_recording.py): one private dataset
// repo per recording, <namespace>/sttm_desktop_<timestamp>, holding the 16 kHz mono WAV,
// verse_timestamps.csv (verseId,timestamp_seconds) and a README with the same front
// matter. The WAV is also kept as <timestamp>.wav next to <timestamp>.csv, which is exactly
// the folder that script takes, so it can re-pack a recording into its parquet shard at
// any time. metadata.csv makes `load_dataset(repo)` give the same columns (audio,
// source_url, duration). Our own timelines and score go under sttm/.
//
// Uploads use the Hub's own HTTP API (preupload, git-lfs batch, one commit): no extra
// package, nothing spawned. A session is pushed once its Azure upload is complete; the
// result is remembered in hf-pushed.json, so a dropped connection just retries next tick.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { HF_NAMESPACE, HF_DATASET_TYPE } = require('./config');
const { sessionToWav, RATE } = require('./wav');

const HUB = 'https://huggingface.co';
const TICK_MS = 2 * 60 * 1000;
const { fetch } = global; // renderer only (Web Audio is needed for the WAV anyway)

let root = null;
let timer = null;
let busy = false;
let tokenFn = () => '';
let log = () => {};

const readJson = (f, d) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (_) {
    return d;
  }
};
const readJsonl = (f) => {
  try {
    return fs
      .readFileSync(f, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch (_) {
    return [];
  }
};
const sha256 = (file) =>
  new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file)
      .on('data', (c) => h.update(c))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject);
  });
const fmtDuration = (s) =>
  `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;
const collectionOf = (name) =>
  String(name || 'unknown_gurdwara')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .join('_');

const readme = ({ timestamp, collection, duration }) => `---
license: cc-by-4.0
tags:
  - audio
  - gurbani
collection: ${collection}
duration: ${duration.toFixed(2)}
video_title: "STTM Desktop Recording ${timestamp}"
text_source: verse_dataset
dataset_type: ${HF_DATASET_TYPE}
approved_count: 0
total_segments: 0
auto_approved_count: 0
---

# STTM Desktop Recording: ${timestamp}

Audio captured from STTM Desktop (Voice-Follow experimental build).

## Metadata

| Field | Value |
|-------|-------|
| **Audio Duration** | ${fmtDuration(duration)} |
| **Sample Rate** | ${RATE} Hz |
| **Channels** | Mono |
| **Collection** | ${collection} |

## Files

| File | Description |
|------|-------------|
| verse_timestamps.csv | verseId,timestamp_seconds rows |
| ${timestamp}.wav, ${timestamp}.csv | the recording and its timestamps, as push_sttm_desktop_recording.py takes them |
| metadata.csv | audio folder metadata (audio, source_url, duration) |
| sttm/ | Voice-Follow session timelines and score |
`;

// verseId,timestamp_seconds: every verse the sevadaar had on screen, when it went up.
const verseCsv = (dir) => {
  const rows = readJsonl(path.join(dir, 'human.jsonl')).filter((h) => h.verseId != null);
  return `verseId,timestamp_seconds\n${rows.map((h) => `${h.verseId},${Number(h.t).toFixed(3)}`).join('\n')}\n`;
};

async function api(token, url, init = {}) {
  // An action's own headers win (a signed LFS step brings its own authorization);
  // Headers is case-insensitive, so the token is never sent twice.
  const headers = new Headers(init.headers || {});
  if (!headers.has('authorization')) headers.set('authorization', `Bearer ${token}`);
  const r = await fetch(url, { ...init, headers });
  if (!r.ok && r.status !== 409)
    throw new Error(
      `${init.method || 'GET'} ${url} -> ${r.status} ${(await r.text()).slice(0, 200)}`,
    );
  return r;
}

async function ensureRepo(token, repo) {
  const [organization, name] = repo.split('/');
  await api(token, `${HUB}/api/repos/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'dataset', name, organization, private: true }),
  });
}

// git-lfs: ask where to put the file, PUT it (whole, or in parts), confirm it.
async function uploadLfs(token, repo, file, oid, size) {
  const lfs = {
    accept: 'application/vnd.git-lfs+json',
    'content-type': 'application/vnd.git-lfs+json',
  };
  const batch = await (
    await api(token, `${HUB}/datasets/${repo}.git/info/lfs/objects/batch`, {
      method: 'POST',
      headers: lfs,
      body: JSON.stringify({
        operation: 'upload',
        transfers: ['basic', 'multipart'],
        hash_algo: 'sha256',
        objects: [{ oid, size }],
      }),
    })
  ).json();
  const obj = (batch.objects || [])[0] || {};
  if (obj.error) throw new Error(`lfs batch: ${obj.error.message}`);
  const up = obj.actions && obj.actions.upload;
  if (!up) return; // already stored
  const header = up.header || {};
  if (header.chunk_size) {
    const chunk = Number(header.chunk_size);
    const parts = Object.keys(header)
      .filter((k) => /^\d+$/.test(k))
      .map(Number)
      .sort((a, b) => a - b);
    const fd = fs.openSync(file, 'r');
    const etags = [];
    try {
      // eslint-disable-next-line no-restricted-syntax
      for (const n of parts) {
        const buf = Buffer.alloc(Math.min(chunk, size - (n - 1) * chunk));
        fs.readSync(fd, buf, 0, buf.length, (n - 1) * chunk);
        // eslint-disable-next-line no-await-in-loop
        const r = await fetch(header[String(n)], { method: 'PUT', body: buf });
        if (!r.ok) throw new Error(`lfs part ${n} -> ${r.status}`);
        etags.push({ partNumber: n, etag: r.headers.get('etag') });
      }
    } finally {
      fs.closeSync(fd);
    }
    await api(token, up.href, {
      method: 'POST',
      headers: lfs,
      body: JSON.stringify({ oid, parts: etags }),
    });
  } else {
    const r = await fetch(up.href, { method: 'PUT', headers: header, body: fs.readFileSync(file) });
    if (!r.ok) throw new Error(`lfs put -> ${r.status}`);
  }
  const verify = obj.actions && obj.actions.verify;
  if (verify) {
    await api(token, verify.href, {
      method: 'POST',
      headers: { ...lfs, ...(verify.header || {}) },
      body: JSON.stringify({ oid, size }),
    });
  }
}

// One commit with every file: small ones inline, the WAV as an LFS pointer.
async function commit(token, repo, files, summary) {
  const pre = await (
    await api(token, `${HUB}/api/datasets/${repo}/preupload/main`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        files: files.map((f) => ({
          path: f.path,
          size: f.size,
          sample: f.sample.toString('base64'),
        })),
      }),
    })
  ).json();
  const modes = Object.fromEntries((pre.files || []).map((f) => [f.path, f.uploadMode]));
  const ops = [{ key: 'header', value: { summary } }];
  // eslint-disable-next-line no-restricted-syntax
  for (const f of files) {
    if (modes[f.path] === 'lfs') {
      // eslint-disable-next-line no-await-in-loop
      const oid = await sha256(f.file);
      // eslint-disable-next-line no-await-in-loop
      await uploadLfs(token, repo, f.file, oid, f.size);
      ops.push({ key: 'lfsFile', value: { path: f.path, algo: 'sha256', oid, size: f.size } });
    } else {
      ops.push({
        key: 'file',
        value: {
          path: f.path,
          content: fs.readFileSync(f.file).toString('base64'),
          encoding: 'base64',
        },
      });
    }
  }
  await api(token, `${HUB}/api/datasets/${repo}/commit/main`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-ndjson' },
    body: `${ops.map((o) => JSON.stringify(o)).join('\n')}\n`,
  });
}

// Builds the recording files in the session folder and pushes them. Idempotent.
async function pushSession(dir, token, namespace = HF_NAMESPACE) {
  const timestamp = path.basename(dir);
  const session = readJson(path.join(dir, 'session.json'), {});
  const collection = collectionOf((session.tester || {}).gurdwara);
  const wavFile = path.join(dir, `${timestamp}.wav`);
  const duration = fs.existsSync(wavFile)
    ? (fs.statSync(wavFile).size - 44) / 2 / RATE
    : await sessionToWav(dir, timestamp);
  if (!(duration > 1)) throw new Error('no audio to push');
  const csv = verseCsv(dir);
  fs.writeFileSync(path.join(dir, `${timestamp}.csv`), csv);
  fs.writeFileSync(path.join(dir, 'README.md'), readme({ timestamp, collection, duration }));
  fs.writeFileSync(
    path.join(dir, 'metadata.csv'),
    `file_name,source_url,duration\n${timestamp}.wav,local://sttm-desktop/recordings/${timestamp},${duration.toFixed(3)}\n`,
  );
  const repo = `${namespace}/sttm_desktop_${timestamp.replace(/-/g, '_')}`;
  const entry = (file, p) => {
    const full = path.join(dir, file);
    const { size } = fs.statSync(full);
    const fd = fs.openSync(full, 'r');
    const sample = Buffer.alloc(Math.min(512, size));
    fs.readSync(fd, sample, 0, sample.length, 0);
    fs.closeSync(fd);
    return { file: full, path: p, size, sample };
  };
  const files = [
    entry(`${timestamp}.wav`, `${timestamp}.wav`),
    entry(`${timestamp}.csv`, `${timestamp}.csv`),
    entry(`${timestamp}.csv`, 'verse_timestamps.csv'),
    entry('metadata.csv', 'metadata.csv'),
    entry('README.md', 'README.md'),
    ...[
      'session.json',
      'score.json',
      'human.jsonl',
      'system.jsonl',
      'events.jsonl',
      'activity.jsonl',
    ]
      .filter((f) => fs.existsSync(path.join(dir, f)))
      .map((f) => entry(f, `sttm/${f}`)),
  ];
  await ensureRepo(token, repo);
  await commit(
    token,
    repo,
    files,
    `STTM Desktop recording ${timestamp} (${fmtDuration(duration)})`,
  );
  fs.writeFileSync(
    path.join(dir, 'hf-pushed.json'),
    JSON.stringify({ repo, duration, at: new Date().toISOString() }, null, 1),
  );
  return repo;
}

// A session is ready once it is over and scored (score.json written) and not yet pushed.
// It does not wait for Azure: the two copies are independent.
const ready = (dir) =>
  fs.existsSync(path.join(dir, 'score.json')) && !fs.existsSync(path.join(dir, 'hf-pushed.json'));

async function drain() {
  const token = (tokenFn() || '').trim();
  if (busy || !root || !token || !fs.existsSync(root)) return;
  busy = true;
  try {
    const bus = require('./bus'); // eslint-disable-line global-require
    const dirs = fs
      .readdirSync(root)
      .map((id) => path.join(root, id))
      .filter((d) => fs.statSync(d).isDirectory() && d !== bus.sessionDir() && ready(d))
      .sort();
    // eslint-disable-next-line no-restricted-syntax
    for (const dir of dirs) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const repo = await pushSession(dir, token);
        log(`hf: pushed ${path.basename(dir)} -> ${repo}`);
      } catch (e) {
        log(`hf: ${path.basename(dir)}: ${e.message}`);
        break; // offline or rejected: try again next tick
      }
    }
  } finally {
    busy = false;
  }
}

function start(shadowRoot, getToken, logger) {
  root = shadowRoot;
  tokenFn = getToken || tokenFn;
  log = logger || log;
  if (timer) return;
  drain();
  timer = setInterval(drain, TICK_MS);
}

module.exports = { start, drain, pushSession, verseCsv, collectionOf };
