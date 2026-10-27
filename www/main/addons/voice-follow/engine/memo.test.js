// node --test www/main/addons/voice-follow/engine/memo.test.js
// One model pass per distinct window in every performance tier: while a Shabad or Bani is
// followed, the follower decodes on the recognizer's beat and its window is byte-identical to
// the recognizer's, so Infer answers it from the memo instead of running the model again.
const { describe, it } = require('node:test');
const assert = require('node:assert');
const pace = require('./pace');
const { Infer } = require('./infer');

const SR = 16000;
const windowOf = (seed) => {
  const buf = new Float32Array(4 * SR);
  for (let i = 0; i < buf.length; i += 1) buf[i] = Math.sin((i + seed) / 7) * 0.1;
  return buf;
};

function fakeInfer() {
  const inf = new Infer(null, []);
  inf.passes = 0;
  inf.run = async (buf) => {
    inf.passes += 1;
    return { data: new Float32Array(4), frames: 1, C: 4, len: buf.length };
  };
  return inf;
}

describe('Infer memo (every tier)', () => {
  it('the fast tier answers a repeated window from the memo (one pass, same output)', async () => {
    pace.setScoped(false); // searching, kirtan and sung Banis run the fast tier
    assert.equal(pace.current().name, 'fast');
    const inf = fakeInfer();
    const w = windowOf(1);
    const a = await inf.emissions(w); // the recognizer
    const b = await inf.emissions(w.slice(0)); // the follower: its own copy of the same audio
    assert.equal(inf.passes, 1);
    assert.strictEqual(b, a);
  });

  it('a different window is a model pass', async () => {
    pace.setScoped(false);
    const inf = fakeInfer();
    await inf.emissions(windowOf(1));
    await inf.emissions(windowOf(2));
    assert.equal(inf.passes, 2);
  });

  it('VF_NO_MEMO turns the memo off', async () => {
    const inf = fakeInfer();
    inf.memo = null; // what VF_NO_MEMO=1 does in the constructor
    const w = windowOf(3);
    await inf.emissions(w);
    await inf.emissions(w);
    assert.equal(inf.passes, 2);
  });
});

describe('pace.onBeat (every tier)', () => {
  it('the follower decodes on the recognizer beat chunk in the fast tier too', () => {
    pace.setScoped(false);
    assert.equal(pace.current().name, 'fast');
    const beat = new Float32Array(2048);
    const other = new Float32Array(2048);
    pace.markBeat(beat);
    assert.equal(pace.onBeat(beat), true);
    assert.equal(pace.onBeat(other), false);
  });
});
