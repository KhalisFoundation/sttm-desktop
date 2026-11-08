// Pre-roll ear: audio-thread chunks into the loudness sums and the 16 kHz ring.
// Run with: node --test www/main/addons/voice-follow/shadow/listener.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { feed } = require('./listener');

const state = (ringLen) => ({
  ring: new Int16Array(ringLen),
  ringPos: 0,
  ringFull: false,
  acc: 0,
  next: null,
  sumSq: 0,
  n: 0,
});
const ramp = (from, n) => Float32Array.from({ length: n }, (_, i) => (from + i + 1) / 10000);
const i16 = (v) => Math.trunc(v * 32767); // Int16Array assignment truncates, as before

describe('shadow listener: feed', () => {
  it('copies 16 kHz input straight into the ring, in order across chunks', () => {
    const s = state(100);
    feed(s, 0, ramp(0, 30), 1);
    feed(s, 30, ramp(30, 30), 1);
    assert.equal(s.ringPos, 60);
    assert.deepEqual(Array.from(s.ring.subarray(0, 60)), Array.from(ramp(0, 60), i16));
    assert.equal(s.n, 60);
  });

  it('downsamples 48 kHz by 3 with the phase carried across chunks', () => {
    const s = state(100);
    const x = ramp(0, 300);
    feed(s, 0, x.subarray(0, 128), 3);
    feed(s, 128, x.subarray(128), 3);
    const want = Array.from({ length: 100 }, (_, k) => i16(x[k * 3]));
    assert.deepEqual(Array.from(s.ring), want);
  });

  it('fills a missing chunk with silence and skips repeated frames', () => {
    const s = state(100);
    feed(s, 0, ramp(0, 10), 1);
    feed(s, 20, ramp(20, 10), 1); // frames 10..19 never arrived
    feed(s, 25, ramp(25, 10), 1); // 25..29 repeated
    assert.equal(s.ringPos, 35);
    assert.deepEqual(Array.from(s.ring.subarray(10, 20)), new Array(10).fill(0));
    assert.deepEqual(Array.from(s.ring.subarray(20, 35)), Array.from(ramp(20, 15), i16));
  });

  it('wraps the ring and caps a huge hole at one ring of silence', () => {
    const s = state(50);
    feed(s, 0, ramp(0, 10), 1);
    feed(s, 1e9, ramp(0, 5), 1);
    assert.equal(s.ringFull, true);
    assert.equal(s.n, 10 + 50 + 5);
  });

  it('ScriptProcessor fallback (no frame) just appends', () => {
    const s = state(100);
    feed(s, null, ramp(0, 10), 1);
    feed(s, null, ramp(10, 10), 1);
    assert.equal(s.ringPos, 20);
  });
});
