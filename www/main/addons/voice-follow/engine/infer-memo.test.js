// node --test: the model runs once per distinct window, in every performance tier.
const test = require('node:test');
const assert = require('node:assert');

delete process.env.VF_TIER;
delete process.env.VF_NO_MEMO;
const pace = require('./pace');
const { Infer } = require('./infer');

// A stand-in for Infer.run: counts model passes and answers from the window's content.
function counted() {
  const inf = new Infer(null, []);
  inf.passes = 0;
  inf.run = async (buf) => {
    inf.passes += 1;
    return { data: Float32Array.of(buf[0], buf[buf.length - 1]), frames: 1, C: 2 };
  };
  return inf;
}
const win = (v, n = 64000) => new Float32Array(n).fill(v);

test('fast tier (outside a read Bani): a repeated window is answered without a second pass', async () => {
  pace.setScoped(false);
  assert.strictEqual(pace.current().name, 'fast');
  const inf = counted();
  const a = await inf.emissions(win(0.1));
  const b = await inf.emissions(win(0.1)); // the follower's copy of the recognizer's window
  assert.strictEqual(inf.passes, 1);
  assert.deepStrictEqual(b, a);
  assert.strictEqual(inf.perfStats().repeats, 1);
});

test('a different window (one sample apart, or another length) is a real pass', async () => {
  const inf = counted();
  await inf.emissions(win(0.1));
  const other = win(0.1);
  other[100] = 0.2;
  await inf.emissions(other);
  await inf.emissions(win(0.1, 160000));
  assert.strictEqual(inf.passes, 3);
});

test('VF_NO_MEMO=1 runs every window', async () => {
  process.env.VF_NO_MEMO = '1';
  const inf = counted();
  await inf.emissions(win(0.3));
  await inf.emissions(win(0.3));
  delete process.env.VF_NO_MEMO;
  assert.strictEqual(inf.passes, 2);
});
