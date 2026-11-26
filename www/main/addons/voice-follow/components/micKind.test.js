// The shared input-kind list (common/mic-check, also used by the tester Record card), checked on
// the names Gurdwara Sahibs' computers really show. The module is JSX, so it is compiled here.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');

const file = path.join(__dirname, '../../../common/mic-check/index.jsx');
const { code } = babel.transformFileSync(file, { cwd: path.join(__dirname, '../../../../..') });
const m = new Module(file, module);
m.filename = file;
m.paths = Module._nodeModulePaths(path.dirname(file)); // eslint-disable-line no-underscore-dangle
m._compile(code, file); // eslint-disable-line no-underscore-dangle
const { micKind, MIC_WARN, micAvoid } = m.exports;
const wrong = (label) => !!MIC_WARN[micKind(label)];

test('names that are probably the wrong input are flagged', () => {
  const cases = {
    'Iriun Webcam #4': 'webcam',
    'ZoomAudioDevice (Virtual)': 'virtual',
    'Microsoft Teams Audio': 'virtual',
    'CABLE Output (VB-Audio Virtual Cable)': 'virtual',
    'Stereo Mix (Realtek(R) Audio)': 'virtual',
    'Microphone (NVIDIA Broadcast)': 'virtual',
    'BlackHole 2ch': 'virtual',
    'Camo Microphone': 'virtual',
    'Krisp Microphone': 'virtual',
    'Microphone (Steam Streaming Microphone)': 'virtual',
    'DroidCam Virtual Audio': 'phone',
    'EpocCam Microphone': 'phone',
    'WO Mic Device': 'phone',
    "Arash's iPhone Microphone": 'phone',
    'C922 Pro Stream Webcam': 'webcam',
    'Microphone (HD Pro Webcam C920)': 'webcam',
    'AirPods Pro': 'bluetooth',
    'Headset Microphone (Jabra Evolve 20)': 'bluetooth',
    'WH-1000XM4 Hands-Free AG Audio': 'bluetooth',
    'Headphones (Soundcore Life Q30)': 'bluetooth',
  };
  Object.entries(cases).forEach(([name, kind]) => {
    assert.ok(wrong(name), `${name} should warn`);
    if (kind) assert.strictEqual(micKind(name), kind, name);
  });
});

test('mixers, the computer mic and unknown names are not flagged', () => {
  [
    'MacBook Pro Microphone (Built-in)',
    'Default - MacBook Pro Microphone (Built-in)',
    'Microphone Array (Realtek(R) Audio)',
    'Line In (Realtek High Definition Audio)',
    'USB Audio CODEC',
    'Zoom H6',
    'L-8 (ZOOM)',
    'Microphone (Behringer UMC204HD)',
    'Focusrite Scarlett 2i2',
    'Yamaha MG10XU',
    'Yeti Stereo Microphone',
    'Observer Mic',
    'Microphone (Realtek(R) Audio)',
    '',
  ].forEach((name) => assert.ok(!wrong(name), `${name} should not warn`));
});

// Voice Autopilot's narrow "almost surely not the hall's feed" test (micAvoid), on the input names
// in the Nov 11-25 field logs. Desk-feed and routing tools carry the real kirtan and must never be
// flagged (else Autopilot would skip them as its default and ask on every Start).
const mw = require('./micWarning');

const kinds = { kindOf: micKind, isWrong: micAvoid };
const mic = (label) => ({ deviceId: label, label });

test('micAvoid: phone relays, Bluetooth headsets and plain webcams are flagged', () => {
  [
    ['Microphone (Iriun Webcam #4)', 'phone'],
    ['Microphone (AudioRelay Virtual Mic)', 'phone'],
    ['DroidCam Virtual Audio', 'phone'],
    ['EpocCam Microphone', 'phone'],
    ['WO Mic Device', 'phone'],
    ['Camo Microphone', 'phone'],
    ["Arash's iPhone Microphone", 'phone'],
    ['AirPods Pro', 'bluetooth'],
    ['Headset (WH-1000XM4 Hands-Free AG Audio)', 'bluetooth'],
    ['Microphone (HD Pro Webcam C920)', 'webcam'],
    ['Logitech BRIO', 'webcam'],
    ['FaceTime HD Camera', 'webcam'],
  ].forEach(([name, kind]) => assert.strictEqual(micAvoid(name), kind, name));
});

test('micAvoid: desk feeds and routing tools are never flagged (field sites)', () => {
  [
    'Webcam 1 (NDI Webcam Audio)', // GNSG Sedgley Street Wolverhampton, 216 h fine
    'Webcam 2 (NDI Webcam Audio)',
    'Splashtop Remote Sound (Virtual)', // Gurdwara Jot Parkash Sahib Brampton, 72 h
    'DVS Receive 1-2 (Dante Virtual Soundcard)', // Regan Road Brampton, 262 h main feed
    'Voicemeeter Out B1 (VB-Audio Voicemeeter VAIO)',
    'Voicemeeter Out A1 (VB-Audio Voicemeeter VAIO)',
    'CABLE Output (VB-Audio Virtual Cable)',
    'Dante Via Receive (Dante Via)',
    'OBS Virtual Audio',
    'BlackHole 2ch',
    'Loopback Audio',
    'Soundflower (2ch)',
    'Stereo Mix (Realtek(R) Audio)',
    'ZoomAudioDevice (Virtual)',
    'Microphone (Wireless Microphone) (3547:0407)',
    'MacBook Pro Microphone (Built-in)',
    'USB Audio CODEC',
    '',
  ].forEach((name) => assert.strictEqual(micAvoid(name), null, name));
});

test('field sites: default input and Start confirm', () => {
  const iriun = mic('Microphone (Iriun Webcam #4)');
  const wireless = mic('Microphone (Wireless Microphone) (3547:0407)');
  const dvs = mic('DVS Receive 1-2 (Dante Virtual Soundcard)');
  const vm = mic('Voicemeeter Out B1 (VB-Audio Voicemeeter VAIO)');
  const ndi = mic('Webcam 1 (NDI Webcam Audio)');
  const splash = mic('Splashtop Remote Sound (Virtual)');
  // Hicksville: the Iriun default is passed over for the Wireless Microphone.
  assert.deepStrictEqual(mw.pickDefaultMic([iriun, wireless], iriun, kinds), {
    device: wireless,
    avoided: iriun,
  });
  // Plainview: Iriun is the only input. It stays the default; the Start confirm has no
  // "Use" link (no other input), only "Start anyway"; nothing fails silently.
  assert.deepStrictEqual(mw.pickDefaultMic([iriun], iriun, kinds), {
    device: iriun,
    avoided: null,
  });
  assert.strictEqual(micAvoid(iriun.label), 'phone'); // so the Start confirm shows
  assert.strictEqual(mw.bestOtherMic([iriun], iriun.deviceId, kinds), null);
  // Wolverhampton, Jot Parkash Sahib, Regan Road: their desk feed is kept as the default, with
  // no Start confirm.
  [ndi, splash, dvs, vm].forEach((d) => {
    assert.deepStrictEqual(mw.pickDefaultMic([d, iriun], d, kinds), { device: d, avoided: null });
    assert.strictEqual(micAvoid(d.label), null, d.label);
  });
  // Regan Road: Voicemeeter picked by hand and silent. Dante is a probe candidate (only
  // Bluetooth is excluded) and can be offered as "Use ...".
  const probeable = [dvs, ndi, mic('AirPods Pro')].filter(
    (d) => micKind(d.label) !== 'bluetooth' && micAvoid(d.label) !== 'bluetooth',
  );
  assert.deepStrictEqual(probeable, [dvs, ndi]);
  assert.strictEqual(
    mw.pickProbedMic([{ ...dvs, rms: 0.05 }], { goodRms: 0.004 }).deviceId,
    dvs.deviceId,
  );
});
