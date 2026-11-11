// STTM Data recordings go to Khalis's Azure Blob storage, the same container and append-only
// key (create, write and list; no read or delete) the Voice Autopilot Shadower uses, but in a
// folder of their own so the source is always clear:
//
//   sttm-data/<private|public>/<kirtan|paath|akhand_kirtan>/<gurdwara>/<recording id>/
//       <id>.wav             16 kHz mono 16-bit, as recorded
//       verse_timestamps.csv verseId,timestamp_seconds: the pangtis shown, by verse ID
//       human.jsonl          the same, as recorded
//       session.json         kind, Private/Public, mic, Gurdwara Sahib, consent, audio health
//       complete.json        written last: the recording is fully uploaded
//
// Moving recordings on to Hugging Face is done later, outside the app. uploaded.json in the
// recording folder keeps what has been sent, so an interrupted upload resumes.
const fs = require('fs');
const path = require('path');

const SOURCE = 'sttm-data';
const ROOT = 'sttm-data';
const RATE = 16000;
const TYPES = {
  '.wav': 'audio/wav',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.jsonl': 'application/x-ndjson',
};

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

const slug = (x, d) =>
  String(x || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || d;

// The pangtis the sevadaar showed, by verse ID and seconds from the start of the audio.
const verseCsv = (dir) => {
  const rows = readJsonl(path.join(dir, 'human.jsonl')).filter((h) => h.verseId != null);
  return `verseId,timestamp_seconds\n${rows.map((h) => `${h.verseId},${Number(h.t).toFixed(3)}`).join('\n')}\n`;
};

// Where a recording goes in the container. Anything not marked public is private.
const prefixOf = (id, session) => {
  const visibility = session.visibility === 'public' ? 'public' : 'private';
  const kind = slug(session.kind, 'other').replace(/-/g, '_');
  const gurdwara = slug((session.tester || {}).gurdwara, 'unknown-gurdwara');
  return [ROOT, visibility, kind, gurdwara, id].map(encodeURIComponent).join('/');
};

const configured = (url, sas) => Boolean(url && sas && !String(sas).startsWith('__'));

// Upload one finished recording. Returns the folder it went to; throws when offline.
async function pushRecording(dir, { url, sas, fetchImpl } = {}) {
  if (!configured(url, sas)) throw new Error('uploads are off in this build');
  const doFetch = fetchImpl || global.fetch;
  const id = path.basename(dir);
  const session = readJson(path.join(dir, 'session.json'), null);
  if (!session) throw new Error('no session.json');
  const wav = path.join(dir, 'audio', `${id}.wav`);
  if (!fs.existsSync(wav) || (fs.statSync(wav).size - 44) / 2 / RATE <= 1) {
    throw new Error('no audio to upload');
  }
  fs.writeFileSync(path.join(dir, 'verse_timestamps.csv'), verseCsv(dir));
  const prefix = prefixOf(id, session);
  const files = [
    ['session.json', path.join(dir, 'session.json')],
    ['human.jsonl', path.join(dir, 'human.jsonl')],
    ['verse_timestamps.csv', path.join(dir, 'verse_timestamps.csv')],
    [`${id}.wav`, wav],
  ];
  const doneFile = path.join(dir, 'uploaded.json');
  const done = readJson(doneFile, {});
  const put = async (name, body) => {
    const r = await doFetch(`${url}/${prefix}/${encodeURIComponent(name)}?${sas}`, {
      method: 'PUT',
      headers: {
        'content-type': TYPES[path.extname(name)] || 'application/octet-stream',
        'content-length': String(body.length),
        'x-ms-blob-type': 'BlockBlob',
      },
      body,
    });
    if (!r.ok) throw new Error(`upload ${name}: ${r.status}`);
  };
  // eslint-disable-next-line no-restricted-syntax
  for (const [name, full] of files) {
    if (fs.existsSync(full)) {
      const body = fs.readFileSync(full);
      if (done[name] !== body.length) {
        // eslint-disable-next-line no-await-in-loop
        await put(name, body);
        done[name] = body.length;
        fs.writeFileSync(doneFile, JSON.stringify(done, null, 1));
      }
    }
  }
  const complete = Buffer.from(
    JSON.stringify({ source: SOURCE, id, files: Object.keys(done), at: new Date().toISOString() }),
  );
  await put('complete.json', complete);
  return prefix;
}

module.exports = { pushRecording, verseCsv, prefixOf, configured, SOURCE };
