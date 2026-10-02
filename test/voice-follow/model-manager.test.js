const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const file = path.resolve(__dirname, '../../www/main/addons/voice-follow/engine/model-manager.js');
const bytes = 184311219;

function fixture(t, type = 'renderer', fsOverride = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-model-cache-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const profile = path.join(root, 'profile');
  const temporary = path.join(root, 'temporary');
  const legacy = path.join(temporary, 'sttm', 'voice-follow', 'model.int8.onnx');
  const target = path.join(profile, 'voice-follow', 'model.int8.onnx');
  const app = {
    getPath: (name) => {
      assert.equal(name, 'userData');
      return profile;
    },
  };
  let downloads = 0;
  const mod = { exports: {} };
  vm.runInNewContext(`(function(require,module,process){${fs.readFileSync(file, 'utf8')}\n})`, {})(
    (id) => {
      if (id === 'electron') return type === 'browser' ? { app } : {};
      if (id === '@electron/remote') {
        assert.equal(type, 'renderer');
        return { app };
      }
      if (id === 'os') return { tmpdir: () => temporary };
      if (id === 'fs') return { ...fs, ...fsOverride };
      if (id === 'https')
        return {
          get: () => {
            downloads++;
            throw new Error('Network forbidden in this test');
          },
        };
      return require(id);
    },
    mod,
    { type, pid: process.pid },
  );
  // Sparse files check the existing size-based cache contract, not ONNX validity.
  function write(location, size = bytes) {
    fs.mkdirSync(path.dirname(location), { recursive: true });
    const fd = fs.openSync(location, 'w');
    fs.ftruncateSync(fd, size);
    fs.closeSync(fd);
  }
  return { manager: mod.exports, legacy, target, write, downloads: () => downloads };
}

test('Electron renderer resolves its persistent profile through remote.app', (t) => {
  const f = fixture(t);
  assert.equal(f.manager.modelPath(), f.target);
});
test('Electron main process retains its own app profile', (t) => {
  const f = fixture(t, 'browser');
  assert.equal(f.manager.modelPath(), f.target);
});
test('plain Node retains the temporary test fallback', (t) => {
  const f = fixture(t, null);
  assert.equal(f.manager.modelPath(), f.legacy);
});
test('an existing persistent model needs no migration or download', async (t) => {
  const f = fixture(t);
  f.write(f.target);
  assert.equal(await f.manager.ensureModel(), f.target);
  assert.equal(f.downloads(), 0);
});
test('a size-valid legacy cache is copied into the persistent profile without downloading', async (t) => {
  const f = fixture(t);
  f.write(f.legacy);
  assert.equal(await f.manager.ensureModel(), f.target);
  assert.equal(fs.statSync(f.target).size, bytes);
  assert.ok(fs.existsSync(f.legacy));
  assert.equal(f.downloads(), 0);
});
test('a truncated legacy file is never promoted as a ready model', async (t) => {
  const f = fixture(t);
  f.write(f.legacy, 100);
  await assert.rejects(f.manager.ensureModel(), /Network forbidden/);
  assert.equal(fs.existsSync(f.target), false);
  assert.equal(f.downloads(), 1);
});
test('failed migration preserves the legacy file and removes its incomplete destination', async (t) => {
  const f = fixture(t, 'renderer', {
    copyFileSync: (_from, to) => {
      fs.writeFileSync(to, 'incomplete test artifact');
      throw new Error('Controlled copy failure');
    },
  });
  f.write(f.legacy);
  await assert.rejects(f.manager.ensureModel(), /Controlled copy failure/);
  assert.equal(fs.existsSync(f.target), false);
  assert.ok(fs.existsSync(f.legacy));
  assert.deepEqual(fs.readdirSync(path.dirname(f.target)), []);
  assert.equal(f.downloads(), 0);
});
