// STTM Data recordings upload to sttm-data/<private|public>/<kind>/<gurdwara>/<id>/ in Azure.
// Network calls are faked; nothing leaves the machine.
// Run with: node --test www/main/data-recording/azure-upload.test.js
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pushRecording } = require('./azure-upload');

const URL = 'https://example.blob.core.windows.net/container';
const SAS = 'sv=x&sp=cwl&sig=y';

const makeRecording = (root, id, session, seconds = 3) => {
  const dir = path.join(root, id);
  fs.mkdirSync(path.join(dir, 'audio'), { recursive: true });
  const n = 16000 * seconds;
  const wav = Buffer.alloc(44 + n * 2);
  wav.write('RIFF', 0);
  wav.write('WAVE', 8);
  fs.writeFileSync(path.join(dir, 'audio', `${id}.wav`), wav);
  fs.writeFileSync(
    path.join(dir, 'human.jsonl'),
    '{"t":0.5,"verseId":101}\n{"t":2,"verseId":102}\n',
  );
  fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify(session));
  return dir;
};

describe('azure-upload.pushRecording', () => {
  let root;
  let calls;
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 201 };
  };
  beforeEach(() => {
    calls = [];
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'rec-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const names = () => calls.map((c) => c.url.split('?')[0].replace(`${URL}/`, ''));

  it('private: sttm-data/private/<kind>/<gurdwara>/<id>/, complete.json last', async () => {
    const id = '2026-11-05T20-00-00-000Z';
    const dir = makeRecording(root, id, {
      kind: 'akhand_kirtan',
      visibility: 'private',
      tester: { gurdwara: 'Test Gurdwara Sahib' },
    });
    const prefix = await pushRecording(dir, { url: URL, sas: SAS, fetchImpl });
    const p = `sttm-data/private/akhand_kirtan/test-gurdwara-sahib/${id}`;
    assert.equal(prefix, p);
    assert.deepEqual(names(), [
      `${p}/session.json`,
      `${p}/human.jsonl`,
      `${p}/verse_timestamps.csv`,
      `${p}/${id}.wav`,
      `${p}/complete.json`,
    ]);
    assert.ok(calls.every((c) => c.url.endsWith(`?${SAS}`) && c.init.method === 'PUT'));
    const csv = fs.readFileSync(path.join(dir, 'verse_timestamps.csv'), 'utf8');
    assert.equal(csv, 'verseId,timestamp_seconds\n101,0.500\n102,2.000\n');
  });

  it('public goes under sttm-data/public/', async () => {
    const id = '2026-11-05T21-00-00-000Z';
    const dir = makeRecording(root, id, { kind: 'paath', visibility: 'public', tester: {} });
    assert.equal(
      await pushRecording(dir, { url: URL, sas: SAS, fetchImpl }),
      `sttm-data/public/paath/unknown-gurdwara/${id}`,
    );
  });

  it('a recording not marked public is private', async () => {
    const id = '2026-11-05T22-00-00-000Z';
    const dir = makeRecording(root, id, { kind: 'kirtan' });
    assert.match(
      await pushRecording(dir, { url: URL, sas: SAS, fetchImpl }),
      /^sttm-data\/private\//,
    );
  });

  it('resumes: files already sent are not sent again', async () => {
    const id = '2026-11-05T23-00-00-000Z';
    const dir = makeRecording(root, id, { kind: 'kirtan', visibility: 'public' });
    await pushRecording(dir, { url: URL, sas: SAS, fetchImpl });
    calls = [];
    await pushRecording(dir, { url: URL, sas: SAS, fetchImpl });
    assert.deepEqual(
      names().map((n) => n.split('/').pop()),
      ['complete.json'],
    );
  });

  it('refuses a recording with no audio, and a build without the key', async () => {
    const id = '2026-11-06T00-00-00-000Z';
    const dir = makeRecording(root, id, { kind: 'kirtan' }, 0);
    await assert.rejects(pushRecording(dir, { url: URL, sas: SAS, fetchImpl }), /no audio/);
    await assert.rejects(
      pushRecording(dir, { url: URL, sas: '__VF_UPLOAD_SAS__', fetchImpl }),
      /uploads are off/,
    );
  });
});
