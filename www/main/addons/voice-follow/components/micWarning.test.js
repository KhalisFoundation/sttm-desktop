const test = require('node:test');
const assert = require('node:assert');
const { virtualMicKind, createMicWatch, pickProbedMic, dismissKey } = require('./micWarning');

test('virtual input names are recognised', () => {
  assert.strictEqual(virtualMicKind('Iriun Webcam #4'), 'Iriun');
  assert.strictEqual(virtualMicKind('DroidCam Virtual Audio'), 'DroidCam');
  assert.strictEqual(virtualMicKind('Camo Microphone'), 'Camo');
  assert.strictEqual(virtualMicKind('CABLE Output (VB-Audio Virtual Cable)'), 'VB-Audio');
  assert.strictEqual(virtualMicKind('Stereo Mix (Realtek(R) Audio)'), 'Stereo Mix');
  assert.strictEqual(virtualMicKind('Microphone (NVIDIA Broadcast)'), 'NVIDIA Broadcast');
  assert.strictEqual(virtualMicKind('ZoomAudioDevice'), 'Zoom');
  assert.strictEqual(virtualMicKind('Microsoft Teams Audio'), 'Teams');
  assert.strictEqual(virtualMicKind('OBS Virtual Camera'), 'OBS');
  assert.strictEqual(virtualMicKind('BlackHole 2ch'), 'BlackHole');
  assert.strictEqual(virtualMicKind('Some Virtual Mic'), 'Virtual');
});

test('real microphones and mixers are not flagged', () => {
  [
    'MacBook Pro Microphone',
    'Microphone Array (Realtek(R) Audio)',
    'USB Audio CODEC',
    'Zoom H4n',
    'L-8 (ZOOM)',
    'Yeti Stereo Microphone',
    'Microphone (Behringer UMC204HD)',
    'Line In (Realtek High Definition Audio)',
    'Observer Mic',
    '',
    null,
  ].forEach((name) => assert.strictEqual(virtualMicKind(name), null, name));
});

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

test('probe pick: the loudest real input clearly picking up sound; virtual never offered', () => {
  assert.strictEqual(pickProbedMic([]), null);
  assert.strictEqual(
    pickProbedMic([
      { deviceId: 'a', label: 'MacBook Pro Microphone', rms: 0.001 },
      { deviceId: 'b', label: 'Iriun Webcam', rms: 0 },
    ]),
    null,
  );
  const pick = pickProbedMic([
    { deviceId: 'v', label: 'Stereo Mix', rms: 0.2 },
    { deviceId: 'a', label: 'USB Audio CODEC', rms: 0.01 },
    { deviceId: 'b', label: 'Microphone Array', rms: 0.03 },
  ]);
  assert.strictEqual(pick.deviceId, 'b');
});

test('dismiss key is per kind and device', () => {
  assert.notStrictEqual(dismissKey('silent', 'x'), dismissKey('quiet', 'x'));
  assert.notStrictEqual(dismissKey('silent', 'x'), dismissKey('silent', 'y'));
  assert.strictEqual(dismissKey('virtual', '', 'Iriun'), 'virtual:Iriun');
});
