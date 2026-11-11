const test = require('node:test');
const assert = require('node:assert');
const { createMicWatch, pickProbedMic, dismissKey } = require('./micWarning');

// Feed `seconds` of 250 ms windows at a level, with heard words every `heardEvery` windows.
const feed = (w, seconds, rms, heardEvery = 0) => {
  let st = null;
  for (let i = 0; i < seconds * 4; i += 1) {
    st = w.push({ rms, heard: heardEvery > 0 && i % heardEvery === 0 });
  }
  return st;
};

test('silent: no sound for 20 s, not before; clears when sound returns', () => {
  const w = createMicWatch();
  assert.strictEqual(feed(w, 19, 0), null);
  assert.strictEqual(feed(w, 1, 0), 'silent');
  assert.strictEqual(feed(w, 5, 0.02), null);
});

test('silent: a pause between lines is not a dead mic', () => {
  const w = createMicWatch();
  for (let i = 0; i < 12; i += 1) {
    feed(w, 1.5, 0.03); // singing
    feed(w, 2, 0); // pause
  }
  assert.strictEqual(w.state(), null);
});

test('quiet: low level, words almost never, for 3 min (laptop mic at the back)', () => {
  const w = createMicWatch();
  assert.strictEqual(feed(w, 170, 0.002, 100), null); // ~1% of windows
  assert.strictEqual(feed(w, 10, 0.002, 100), 'quiet');
  // Good level again: the hint goes.
  assert.strictEqual(feed(w, 180, 0.03, 100), null);
});

test('quiet: not when words come through often, nor when the level is good', () => {
  const a = createMicWatch();
  assert.strictEqual(feed(a, 200, 0.002, 4), null); // words in 25% of windows
  const b = createMicWatch();
  assert.strictEqual(feed(b, 200, 0.05, 0), null); // loud feed, nothing recognised (katha etc.)
});

test('reset clears the history (new session or new input)', () => {
  const w = createMicWatch();
  feed(w, 25, 0);
  assert.strictEqual(w.state(), 'silent');
  w.reset();
  assert.strictEqual(w.state(), null);
  assert.strictEqual(feed(w, 10, 0), null);
});

test('probe pick: the loudest real input clearly picking up sound; a wrong-kind input never offered', () => {
  assert.strictEqual(pickProbedMic([]), null);
  assert.strictEqual(
    pickProbedMic([
      { deviceId: 'a', label: 'MacBook Pro Microphone', rms: 0.001 },
      { deviceId: 'b', label: 'Iriun Webcam', rms: 0 },
    ]),
    null,
  );
  const isWrong = (label) => /stereo mix|iriun/i.test(label);
  const pick = pickProbedMic(
    [
      { deviceId: 'v', label: 'Stereo Mix', rms: 0.2 },
      { deviceId: 'a', label: 'USB Audio CODEC', rms: 0.01 },
      { deviceId: 'b', label: 'Microphone Array', rms: 0.03 },
    ],
    { isWrong },
  );
  assert.strictEqual(pick.deviceId, 'b');
});

test('dismiss key is per kind and device', () => {
  assert.notStrictEqual(dismissKey('silent', 'x'), dismissKey('quiet', 'x'));
  assert.notStrictEqual(dismissKey('silent', 'x'), dismissKey('silent', 'y'));
  assert.strictEqual(dismissKey('virtual', '', 'Iriun'), 'virtual:Iriun');
});

// Stand-ins for common/mic-check's micKind / MIC_WARN (the real list is tested in micKind.test.js).
const kindOf = (label) => {
  if (/iriun|virtual|webcam/i.test(label)) return 'virtual';
  if (/usb audio|codec|wireless microphone|mixer/i.test(label)) return 'mixer';
  if (/macbook|built-in|array/i.test(label)) return 'laptop';
  return 'other';
};
const isWrong = (label) => kindOf(label) === 'virtual';
const mic = (deviceId, label) => ({ deviceId, label });
const {
  pickDefaultMic,
  bestOtherMic,
  createSilenceClock,
  autoPauseMinutes,
  AUTOPAUSE_MIN_DEFAULT,
} = require('./micWarning');

test('default input: a flagged system default is passed over for a real one (Hicksville)', () => {
  const iriun = mic('i', 'Microphone (Iriun Webcam #4)');
  const wireless = mic('w', 'Microphone (Wireless Microphone)');
  const r = pickDefaultMic([iriun, wireless], iriun, { kindOf, isWrong });
  assert.strictEqual(r.device.deviceId, 'w');
  assert.strictEqual(r.avoided.deviceId, 'i');
});

test('default input: only a flagged input -> keep it (the Start confirm then asks)', () => {
  const iriun = mic('i', 'Microphone (Iriun Webcam #4)');
  const r = pickDefaultMic([iriun], iriun, { kindOf, isWrong });
  assert.strictEqual(r.device.deviceId, 'i');
  assert.strictEqual(r.avoided, null);
  assert.strictEqual(bestOtherMic([iriun], 'i', { kindOf, isWrong }), null);
});

test('default input: a fine system default is kept; preference mixer > built-in > other', () => {
  const mac = mic('m', 'MacBook Pro Microphone (Built-in)');
  const usb = mic('u', 'USB Audio CODEC');
  const yeti = mic('y', 'Yeti Stereo Microphone');
  const zoom = mic('z', 'ZoomAudioDevice (Virtual)');
  assert.strictEqual(pickDefaultMic([mac, usb], mac, { kindOf, isWrong }).avoided, null);
  assert.strictEqual(pickDefaultMic([zoom, yeti, mac, usb], zoom, { kindOf, isWrong }).device, usb);
  assert.strictEqual(pickDefaultMic([zoom, yeti, mac], zoom, { kindOf, isWrong }).device, mac);
  assert.strictEqual(pickDefaultMic([zoom, yeti], zoom, { kindOf, isWrong }).device, yeti);
  assert.strictEqual(pickDefaultMic([], null, { kindOf, isWrong }).device, null);
});

test('auto-pause clock: pauses after the full stretch of no sound; any sound restarts it', () => {
  const c = createSilenceClock({ pauseMs: 30 * 60000 });
  let t = 0;
  const run = (ms, rms) => {
    let out = false;
    for (let end = t + ms; t < end; t += 250) out = c.push({ now: t, rms });
    return out;
  };
  assert.strictEqual(run(29 * 60000, 0), false);
  assert.strictEqual(run(60000 + 250, 0.0001), true); // below the no-sound line: still silent
  assert.ok(c.silentMs(t) >= 30 * 60000);
  c.reset();
  assert.strictEqual(run(20 * 60000, 0), false);
  assert.strictEqual(run(250, 0.02), false); // one sound window restarts the clock
  assert.strictEqual(run(20 * 60000, 0), false);
});

test('auto-pause minutes: 30 by default, VF_AUTOPAUSE_MIN overrides for tests', () => {
  assert.strictEqual(AUTOPAUSE_MIN_DEFAULT, 30);
  assert.strictEqual(autoPauseMinutes({}), 30);
  assert.strictEqual(autoPauseMinutes(undefined), 30);
  assert.strictEqual(autoPauseMinutes({ VF_AUTOPAUSE_MIN: '0.5' }), 0.5);
  assert.strictEqual(autoPauseMinutes({ VF_AUTOPAUSE_MIN: 'x' }), 30);
  assert.strictEqual(autoPauseMinutes({ VF_AUTOPAUSE_MIN: '-1' }), 30);
});
