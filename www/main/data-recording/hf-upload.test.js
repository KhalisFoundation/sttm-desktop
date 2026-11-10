// STTM Data recordings: public ones go to a training-tagged repo, private (or unmarked) ones to a
// separately named repo tagged private-test-only. Network calls are faked; nothing leaves the
// machine. Run with: node --test www/main/data-recording/hf-upload.test.js
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

let calls;
const realFetch = global.fetch;

const fakeFetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => '' });
  if (String(url).includes('/preupload/')) {
    const { files } = JSON.parse(init.body);
    return ok({ files: files.map((f) => ({ path: f.path, uploadMode: 'regular' })) });
  }
  return ok({ objects: [] });
};

// Loaded after fetch is faked: hf-upload.js captures global.fetch at require time.
const load = () => {
  delete require.cache[require.resolve('./hf-upload')];
  return require('./hf-upload'); // eslint-disable-line global-require
};

const makeRecording = (root, id, session, seconds = 3) => {
  const dir = path.join(root, id);
  fs.mkdirSync(path.join(dir, 'hf'), { recursive: true });
  const n = 16000 * seconds;
  const wav = Buffer.alloc(44 + n * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + n * 2, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(n * 2, 40);
  fs.writeFileSync(path.join(dir, 'hf', `${id}.wav`), wav);
  fs.writeFileSync(
    path.join(dir, 'human.jsonl'),
    '{"t":0.5,"verseId":101}\n{"t":2,"verseId":102}\n',
  );
  fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify(session));
  return dir;
};

describe('hf-upload.pushRecording', () => {
  let root;
  beforeEach(() => {
    calls = [];
    global.fetch = fakeFetch;
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'rec-'));
  });
  afterEach(() => {
    global.fetch = realFetch;
    fs.rmSync(root, { recursive: true, force: true });
  });

  const readme = (dir) => fs.readFileSync(path.join(dir, 'hf', 'README.md'), 'utf8');
  const repoName = (id, v) => `ns/sttm_data_${v}_${id.replace(/-/g, '_')}`;

  it('private: sttm_data_private_*, private repo, tagged test-only, kind and Gurdwara kept', async () => {
    const id = '2026-11-05T20-00-00-000Z';
    const dir = makeRecording(root, id, {
      kind: 'akhand_kirtan',
      visibility: 'private',
      tester: { gurdwara: 'Test Gurdwara' },
    });
    assert.equal(await load().pushRecording(dir, 'tok', 'ns'), repoName(id, 'private'));
    const create = calls.find((c) => c.url.includes('/api/repos/create'));
    assert.equal(JSON.parse(create.init.body).private, true);
    const md = readme(dir);
    assert.match(md, /dataset_type: akhand_kirtan/);
    assert.match(md, /visibility: private/);
    assert.match(md, /use: private-test-only/);
    assert.match(md, /collection: test_gurdwara/);
    const csv = fs.readFileSync(path.join(dir, 'hf', `${id}.csv`), 'utf8');
    assert.equal(csv, 'verseId,timestamp_seconds\n101,0.500\n102,2.000\n');
  });

  it('public: sttm_data_public_*, tagged training', async () => {
    const id = '2026-11-05T21-00-00-000Z';
    const dir = makeRecording(root, id, {
      kind: 'paath',
      visibility: 'public',
      tester: { gurdwara: 'X' },
    });
    assert.equal(await load().pushRecording(dir, 'tok', 'ns'), repoName(id, 'public'));
    assert.match(readme(dir), /use: training/);
  });

  it('a recording not marked public is treated as private (never mixes into training)', async () => {
    const id = '2026-11-05T22-00-00-000Z';
    const dir = makeRecording(root, id, { kind: 'kirtan', tester: { gurdwara: 'X' } });
    assert.equal(await load().pushRecording(dir, 'tok', 'ns'), repoName(id, 'private'));
  });

  it('refuses a recording with no audio', async () => {
    const id = '2026-11-05T23-00-00-000Z';
    const dir = makeRecording(root, id, { kind: 'kirtan', visibility: 'public' }, 0);
    await assert.rejects(load().pushRecording(dir, 'tok', 'ns'), /no audio/);
  });
});
