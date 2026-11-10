// Upload one Data recording to Hugging Face, in the same layout as the team's other recordings
// (Jaspal's push_sttm_desktop_recording.py): one private dataset repo per recording with
//   data/train-00000-of-00001.parquet  one row: source_url, audio{bytes,path} at 16 kHz, duration
//   verse_timestamps.csv               verseId,timestamp_seconds
//   README.md                          front matter: collection, dataset_type, visibility, use
// so load_dataset(repo) gives the same columns. Public recordings (livestreamed or shared)
// go to sttm_data_public_<timestamp> and may be used for training; private ones go to
// sttm_data_private_<timestamp> and are for a private test set only, never training.
// Uses the Hub's own HTTP API (preupload, git-lfs batch, one commit): no Python, no extra package.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { HF_NAMESPACE } = require('./config');

const RATE = 16000;
const { parquetWrite, ByteWriter } = require('./vendor/hyparquet-writer');

const HUB = 'https://huggingface.co';
const { fetch } = global; // renderer only (Web Audio is needed for the WAV anyway)

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

const readme = ({ timestamp, collection, duration, datasetType, visibility }) => `---
license: cc-by-4.0
tags:
  - audio
  - gurbani
collection: ${collection}
duration: ${duration.toFixed(2)}
video_title: "STTM Desktop Recording ${timestamp}"
text_source: verse_dataset
dataset_type: ${datasetType}
visibility: ${visibility}
use: ${visibility === 'private' ? 'private-test-only' : 'training'}
approved_count: 0
total_segments: 0
auto_approved_count: 0
---

# STTM Desktop Recording: ${timestamp}

Audio recorded with STTM Data (manual Start/Stop, with the sevadaar's consent).

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
| sttm/ | session.json (kind, visibility, Gurdwara, consent) and human.jsonl (the verses shown) |
`;

// The parquet shard datasets' push_to_hub writes for Dataset.from_dict({source_url, audio,
// duration}).cast_column('audio', Audio(16000)): one row, the audio bytes embedded, and the
// "huggingface" key-value metadata that makes load_dataset decode the column as Audio.
function parquetShard(wavFile, timestamp, duration) {
  const wav = fs.readFileSync(wavFile);
  const features = {
    info: {
      features: {
        source_url: { dtype: 'string', _type: 'Value' },
        audio: { sampling_rate: RATE, _type: 'Audio' },
        duration: { dtype: 'float64', _type: 'Value' },
      },
    },
  };
  const writer = new ByteWriter();
  parquetWrite({
    writer,
    columnData: [
      { name: 'source_url', data: [`local://sttm-desktop/recordings/${timestamp}`] },
      { name: 'audio', data: [{ bytes: new Uint8Array(wav), path: `${timestamp}.wav` }] },
      { name: 'duration', data: [duration] },
    ],
    schema: [
      { name: 'schema', num_children: 3 },
      {
        name: 'source_url',
        type: 'BYTE_ARRAY',
        converted_type: 'UTF8',
        repetition_type: 'OPTIONAL',
      },
      { name: 'audio', repetition_type: 'OPTIONAL', num_children: 2 },
      { name: 'bytes', type: 'BYTE_ARRAY', repetition_type: 'OPTIONAL' },
      { name: 'path', type: 'BYTE_ARRAY', converted_type: 'UTF8', repetition_type: 'OPTIONAL' },
      { name: 'duration', type: 'DOUBLE', repetition_type: 'OPTIONAL' },
    ],
    kvMetadata: [{ key: 'huggingface', value: JSON.stringify(features) }],
    codec: 'UNCOMPRESSED',
  });
  return Buffer.from(writer.getBuffer());
}

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

// Builds the upload files in <dir>/hf/ and pushes them; returns the repo. The recording folder
// holds hf/<id>.wav (16 kHz mono), human.jsonl (the verses shown) and session.json (kind,
// visibility, Gurdwara, consent). A private or unmarked recording is never named public.
async function pushRecording(dir, token, namespace = HF_NAMESPACE) {
  const timestamp = path.basename(dir);
  const session = readJson(path.join(dir, 'session.json'), {});
  const collection = collectionOf((session.tester || {}).gurdwara);
  const datasetType = session.kind || 'other';
  const visibility = session.visibility === 'public' ? 'public' : 'private';
  const out = path.join(dir, 'hf');
  const wavFile = path.join(out, `${timestamp}.wav`);
  if (!fs.existsSync(wavFile)) throw new Error('no audio to push');
  const duration = (fs.statSync(wavFile).size - 44) / 2 / RATE;
  if (!(duration > 1)) throw new Error('no audio to push');
  fs.writeFileSync(path.join(out, `${timestamp}.csv`), verseCsv(dir));
  fs.writeFileSync(
    path.join(out, 'README.md'),
    readme({ timestamp, collection, duration, datasetType, visibility }),
  );
  const shard = path.join(out, 'train-00000-of-00001.parquet');
  if (!fs.existsSync(shard)) fs.writeFileSync(shard, parquetShard(wavFile, timestamp, duration));
  const repo = `${namespace}/sttm_data_${visibility}_${timestamp.replace(/-/g, '_')}`;
  const entry = (full, p) => {
    const { size } = fs.statSync(full);
    const fd = fs.openSync(full, 'r');
    const sample = Buffer.alloc(Math.min(512, size));
    fs.readSync(fd, sample, 0, sample.length, 0);
    fs.closeSync(fd);
    return { file: full, path: p, size, sample };
  };
  const files = [
    entry(shard, 'data/train-00000-of-00001.parquet'),
    entry(path.join(out, `${timestamp}.csv`), 'verse_timestamps.csv'),
    entry(path.join(out, 'README.md'), 'README.md'),
    ...['session.json', 'human.jsonl']
      .filter((f) => fs.existsSync(path.join(dir, f)))
      .map((f) => entry(path.join(dir, f), `sttm/${f}`)),
  ];
  await ensureRepo(token, repo);
  await commit(token, repo, files, `STTM Data recording ${timestamp} (${fmtDuration(duration)})`);
  return repo;
}

module.exports = { pushRecording, verseCsv, collectionOf };
