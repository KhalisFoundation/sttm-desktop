// Prod collector resource caps: the 2 GB store cap, the metered-connection check and the
// remote kill-switch rule. Run with: node --test www/main/addons/voice-follow/shadow/caps.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const storage = require('./storage');
const { meteredFrom } = require('./uploader');
const { enabledFrom } = require('./remote');

const session = (root, id, bytes, uploaded) => {
  const d = path.join(root, id);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'audio-000.wav'), Buffer.alloc(bytes));
  fs.writeFileSync(path.join(d, 'session.json'), '{}');
  if (uploaded) {
    fs.writeFileSync(
      path.join(d, 'uploaded.json'),
      JSON.stringify({ 'audio-000.wav': bytes, 'session.json': 2 }),
    );
  }
  return d;
};

describe('storage.capStore', () => {
  it('deletes the oldest uploaded sessions until under the cap; never live or not uploaded', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-cap-'));
    session(root, '2026-01-01T10', 1000, true); // oldest, uploaded
    session(root, '2026-01-02T10', 1000, false); // not uploaded: must stay
    session(root, '2026-01-03T10', 1000, true);
    const live = session(root, '2026-01-04T10', 1000, true); // live: must stay
    const gone = storage.capStore(root, live, () => {}, 2500);
    assert.deepEqual(gone, ['2026-01-01T10', '2026-01-03T10']);
    assert.deepEqual(fs.readdirSync(root).sort(), ['2026-01-02T10', '2026-01-04T10']);
    fs.rmSync(root, { recursive: true, force: true });
  });
  it('does nothing under the cap', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-cap-'));
    session(root, '2026-01-01T10', 1000, true);
    assert.deepEqual(
      storage.capStore(root, null, () => {}, 5000),
      [],
    );
    assert.equal(fs.readdirSync(root).length, 1);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('uploader.meteredFrom', () => {
  it('no report from the OS = not metered (check skipped)', () => {
    assert.equal(meteredFrom(undefined), false);
    assert.equal(meteredFrom({ type: 'wifi' }), false);
  });
  it('cellular, data saver or a metered flag = wait', () => {
    assert.equal(meteredFrom({ type: 'cellular' }), true);
    assert.equal(meteredFrom({ type: 'wifi', saveData: true }), true);
    assert.equal(meteredFrom({ metered: true }), true);
  });
});

describe('remote.enabledFrom', () => {
  it('only an explicit enabled:false turns the collector off', () => {
    assert.equal(enabledFrom({ enabled: false }, 'id', false), false);
    assert.equal(enabledFrom({ enabled: true }, 'id', false), true);
    assert.equal(enabledFrom({}, 'id', false), true);
    assert.equal(enabledFrom(null, 'id', false), true);
    assert.equal(enabledFrom('junk', 'id', false), true);
  });
});
