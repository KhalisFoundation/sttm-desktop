const test = require('node:test');
const assert = require('node:assert');

// A fake browser: localStorage with the start-screen choice and a getUserMedia that records
// the constraints it was asked for.
function fakeBrowser(pref, behaviour) {
  const calls = [];
  global.window = { localStorage: { getItem: (k) => (k === 'vf-mic-device' ? pref : null) } };
  global.navigator = {
    mediaDevices: {
      getUserMedia: async (c) => {
        calls.push(c);
        if (behaviour) behaviour(c, calls.length);
        return { id: calls.length };
      },
    },
  };
  return calls;
}

const { openMic } = require('./mic');

test('no choice saved: the system default is asked for once', async () => {
  const calls = fakeBrowser('');
  await openMic();
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].audio.deviceId, undefined);
});

test('a chosen microphone is asked for exactly, like the recognizer', async () => {
  const calls = fakeBrowser('phone-cam-7');
  await openMic();
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(calls[0].audio.deviceId, { exact: 'phone-cam-7' });
  assert.strictEqual(calls[0].audio.echoCancellation, false);
});

test('an unplugged chosen microphone falls back to the default', async () => {
  const calls = fakeBrowser('gone-3', (c, n) => {
    if (n === 1) {
      const e = new Error('no such device');
      e.name = 'NotFoundError';
      throw e;
    }
  });
  await openMic();
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[1].audio.deviceId, undefined);
});

test('a blocked microphone is not papered over with the default', async () => {
  fakeBrowser('cam-1', () => {
    const e = new Error('denied');
    e.name = 'NotAllowedError';
    throw e;
  });
  await assert.rejects(openMic(), (e) => e.name === 'NotAllowedError');
});
