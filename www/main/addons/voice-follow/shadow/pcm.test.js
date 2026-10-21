// Chunk assembly for the recorder: audio-thread chunks laid at their stamped frames.
// Run with: node --test www/main/addons/voice-follow/shadow/pcm.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { toInt16, assembler, WORKLET_SRC } = require('./pcm');

const ramp = (from, n) => Float32Array.from({ length: n }, (_, i) => ((from + i) % 1000) / 1000);
const joined = (bufs) => Buffer.concat(bufs);
const int16 = (buf) => Array.from({ length: buf.length / 2 }, (_, i) => buf.readInt16LE(i * 2));

describe('shadow pcm: sample conversion', () => {
  it('matches the old recorder exactly, clipping out-of-range samples', () => {
    const b = toInt16(Float32Array.from([0, 1, -1, 0.5, -0.5, 2, -2]));
    assert.deepEqual(int16(b), [0, 32767, -32768, 16384, -16384, 32767, -32768]);
  });
});

describe('shadow pcm: chunk assembly', () => {
  it('writes contiguous chunks unchanged', () => {
    const a = assembler(16000);
    const out = [...a.push(0, ramp(0, 1024)), ...a.push(1024, ramp(1024, 1024))];
    assert.deepEqual(joined(out), toInt16(ramp(0, 2048)));
    assert.equal(a.stats.gaps, 0);
    assert.equal(a.stats.overlaps, 0);
  });

  it('pads the start so sample N is audio-clock frame N', () => {
    const a = assembler(16000);
    const out = joined(a.push(300, ramp(0, 100)));
    assert.equal(out.length / 2, 400);
    assert.deepEqual(int16(out.subarray(0, 600)), new Array(300).fill(0));
  });

  it('fills a missing chunk with silence of the same length', () => {
    const a = assembler(16000);
    const out = joined([...a.push(0, ramp(0, 1024)), ...a.push(2048, ramp(2048, 1024))]);
    assert.equal(out.length / 2, 3072);
    assert.deepEqual(int16(out.subarray(2048, 4096)), new Array(1024).fill(0));
    assert.equal(a.stats.gaps, 1);
    assert.equal(a.stats.gapSamples, 1024);
  });

  it('never writes the same frames twice', () => {
    const a = assembler(16000);
    const out = joined([
      ...a.push(0, ramp(0, 1024)),
      ...a.push(512, ramp(512, 1024)), // half repeated
      ...a.push(0, ramp(0, 1024)), // fully repeated
    ]);
    assert.deepEqual(out, toInt16(ramp(0, 1536)));
    assert.equal(a.stats.overlaps, 2);
    assert.equal(a.stats.overlapSamples, 512 + 1024);
  });

  it('does not pad an absurd hole (broken clock)', () => {
    const a = assembler(16000);
    a.push(0, ramp(0, 10));
    const out = joined(a.push(16000 * 3600, ramp(0, 10)));
    assert.equal(out.length / 2, 10);
  });

  it('worklet source parses and registers its processor', () => {
    let name = null;
    // eslint-disable-next-line no-new-func
    new Function('AudioWorkletProcessor', 'registerProcessor', 'currentFrame', WORKLET_SRC)(
      class {
        constructor() {
          this.port = { postMessage() {} };
        }
      },
      (n) => {
        name = n;
      },
      0,
    );
    assert.equal(name, 'shadow-pcm');
  });
});
