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
const { micKind, MIC_WARN } = m.exports;
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
