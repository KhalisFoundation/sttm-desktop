const test = require('node:test');
const assert = require('node:assert');
const mw = require('./micWarning');

// Feed `sec` seconds of 250 ms windows at one level, words heard every `every` windows.
let clock = 0;
const run = (w, sec, rms, every = 0) => {
  let r;
  for (let i = 0; i < sec * 4; i += 1, clock += 250) {
    r = w.push({ rms, heard: every > 0 && i % every === 0, now: clock });
  }
  return r;
};

test('no sound: silent after 20 s (not before), clears with sound; a pause is not a dead mic', () => {
  const w = mw.createMicWatch();
  assert.strictEqual(run(w, 19, 0).hint, null);
  assert.strictEqual(run(w, 1, 0).hint, 'silent');
  assert.strictEqual(run(w, 5, 0.02).hint, null);
  const v = mw.createMicWatch();
  for (let i = 0; i < 12; i += 1) {
    run(v, 1.5, 0.03); // singing
    run(v, 2, 0); // pause between lines
  }
  assert.strictEqual(v.push({ rms: 0 }).hint, null);
});

test('hears very little: 3 min of a low level with words almost never; not when words or level', () => {
  const w = mw.createMicWatch();
  assert.strictEqual(run(w, 170, 0.002, 100).hint, null);
  assert.strictEqual(run(w, 10, 0.002, 100).hint, 'quiet');
  assert.strictEqual(run(w, 180, 0.03, 100).hint, null);
  assert.strictEqual(run(mw.createMicWatch(), 200, 0.002, 4).hint, null); // words 25% of the time
  assert.strictEqual(run(mw.createMicWatch(), 200, 0.05).hint, null); // loud feed (katha etc.)
});

test('hearing dot: null in the first second, then the last 4 s; reset clears', () => {
  const w = mw.createMicWatch();
  assert.strictEqual(w.hearing(), null);
  run(w, 2, 0.02);
  assert.strictEqual(w.hearing(), true);
  run(w, 4, 0);
  assert.strictEqual(w.hearing(), false);
  w.reset();
  assert.strictEqual(w.hearing(), null);
});

test('auto-pause: once, after the full stretch of no sound; any sound restarts the clock', () => {
  const w = mw.createMicWatch({ pauseMs: 30 * 60000 });
  assert.strictEqual(run(w, 20 * 60, 0).pause, false);
  assert.strictEqual(run(w, 0.25, 0.02).pause, false); // one sound window
  assert.strictEqual(run(w, 29 * 60, 0.0001).pause, false);
  let paused = 0;
  for (let i = 0; i < 4 * 61; i += 1) if (run(w, 0.25, 0).pause) paused += 1;
  assert.strictEqual(paused, 1);
  assert.ok(w.silentMs(clock) >= 30 * 60000);
  [
    [{}, 30],
    [undefined, 30],
    [{ VF_AUTOPAUSE_MIN: '0.5' }, 0.5],
    [{ VF_AUTOPAUSE_MIN: 'x' }, 30],
    [{ VF_AUTOPAUSE_MIN: '-1' }, 30],
  ].forEach(([env, min]) => assert.strictEqual(mw.autoPauseMinutes(env), min));
});

// Stand-ins for common/mic-check's micKind / MIC_WARN.
const kindOf = (l) =>
  (/iriun|virtual/i.test(l) && 'virtual') ||
  (/usb audio|wireless microphone/i.test(l) && 'mixer') ||
  (/macbook/i.test(l) && 'laptop') ||
  'other';
const kinds = { kindOf, isWrong: (l) => kindOf(l) === 'virtual' };
const mic = (label) => ({ deviceId: label, label });

test('default input: a flagged system default is passed over (Hicksville); else kept', () => {
  const iriun = mic('Microphone (Iriun Webcam #4)');
  const wireless = mic('Microphone (Wireless Microphone)');
  const mac = mic('MacBook Pro Microphone (Built-in)');
  const usb = mic('USB Audio CODEC');
  const yeti = mic('Yeti Stereo Microphone');
  [
    [[iriun, wireless], iriun, wireless, iriun],
    [[iriun], iriun, iriun, null], // only a flagged input: kept, the Start confirm asks
    [[mac, usb], mac, mac, null], // a fine default is kept
    [[iriun, yeti, mac, usb], iriun, usb, iriun], // mixer first
    [[iriun, yeti, mac], iriun, mac, iriun], // then built-in
    [[iriun, yeti], iriun, yeti, iriun], // then any
    [[], null, null, null],
  ].forEach(([list, def, device, avoided]) =>
    assert.deepStrictEqual(mw.pickDefaultMic(list, def, kinds), { device, avoided }),
  );
});

test('probe pick: the loudest input clearly picking up sound', () => {
  assert.strictEqual(mw.pickProbedMic([{ rms: 0.001 }, { rms: 0 }]), null);
  assert.strictEqual(
    mw.pickProbedMic([
      { id: 'a', rms: 0.01 },
      { id: 'b', rms: 0.03 },
    ]).id,
    'b',
  );
});

test('friendly names (display only), on names from the field logs; duplicates kept apart', () => {
  [
    ['Microphone (Iriun Webcam #4)', 'Iriun Webcam #4'],
    ['Default - Microphone (Iriun Webcam #4)', 'Iriun Webcam #4'],
    ['Communications - Microphone (Wireless Microphone) (3547:0407)', 'Wireless Microphone'],
    ['Default - MacBook Pro Microphone (Built-in)', 'MacBook Pro Microphone'],
    ['ZoomAudioDevice (Virtual)', 'ZoomAudioDevice'],
    ['Microphone (AudioRelay Virtual Mic)', 'AudioRelay Virtual Mic'],
    ['Microphone (Scarlett Solo 4th Gen) (1235:8211)', 'Scarlett Solo 4th Gen'],
    ['Dante Via Receive (Dante Via)', 'Dante Via Receive (Dante Via)'],
    [
      'Microphone Array (Intel® Smart Sound Technology)',
      'Microphone Array (Intel® Smart Sound Technology)',
    ],
    ['Line In (Realtek(R) Audio)', 'Realtek(R) Audio'],
    ['Headset (Jabra Evolve 20)', 'Jabra Evolve 20'],
    ['', ''],
  ].forEach(([label, name]) => assert.strictEqual(mw.friendlyMicName(label), name, label));
  const names = mw.friendlyMicNames([
    mic('MacBook Pro Microphone (Built-in)'),
    mic('Microphone (MacBook Pro Microphone)'),
    mic('Microphone (USB Audio CODEC) (08bb:2902)'),
    mic('Line In (USB Audio CODEC) (08bb:2902)'),
  ]);
  assert.deepStrictEqual(
    [...names.values()],
    [
      'MacBook Pro Microphone (Built-in)',
      'MacBook Pro Microphone',
      'USB Audio CODEC',
      'USB Audio CODEC (2)',
    ],
  );
});
