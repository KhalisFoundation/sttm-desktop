const test = require('node:test');
const assert = require('node:assert');

const PACE = require.resolve('../../www/main/addons/voice-follow/engine/pace');

// A fresh pace module whose self-test measures `ms` per 4 s pass.
async function paceAt(ms) {
  delete require.cache[PACE];
  const pace = require(PACE); // eslint-disable-line global-require, import/no-dynamic-require
  const infer = {
    emissions: () =>
      new Promise((r) => {
        setTimeout(r, ms);
      }),
  };
  await pace.selfTest(infer, { passes: 3, warm: 1 });
  return pace;
}
const hops = (pace) => [pace.hopS('recognizer', 0.5), pace.hopS('follower', 0.25)];

test("fast PC (self-test 135 ms): long backlog and slow live passes leave today's kirtan hops", async () => {
  const pace = await paceAt(135);
  assert.deepStrictEqual(hops(pace), [0.5, 0.25]);
  // falls behind for minutes, and live passes slow to 400 ms (a loaded CPU)
  for (let k = 0; k < 8; k += 1) pace.notePass(400, 4 * 16000);
  for (let t = 0; t <= 300000; t += 500) pace.observe(3, 1e6 + t);
  assert.deepStrictEqual(hops(pace), [0.5, 0.25]);
});

test('slow PC (self-test 330 ms): paced kirtan and the backlog guard apply', async () => {
  const pace = await paceAt(330);
  const [rec, fol] = hops(pace);
  assert.ok(rec >= 1, `recognizer hop ${rec}`);
  assert.strictEqual(fol, 0.375);
  for (let t = 0; t <= 20000; t += 500) pace.observe(3, 1e6 + t);
  assert.ok(pace.hopS('recognizer', 0.5) > rec, 'guard adds time when behind');
});

test('slow PC: the Bani follower (Paath, sung Banis) never takes the kirtan pace', async () => {
  const pace = await paceAt(330);
  assert.strictEqual(pace.hopS('bani', 0.25), 0.25);
  assert.strictEqual(pace.hopS('akhand', 0.25), 0.25);
  for (let t = 0; t <= 20000; t += 500) pace.observe(3, 1e6 + t);
  assert.strictEqual(pace.hopS('bani', 0.25), 0.25);
});

test('slow PC: short search windows at a session start keep the 0.5 s schedule', async () => {
  const pace = await paceAt(330);
  assert.strictEqual(pace.hopS('recognizer', 0.5, 2), 0.5);
  assert.strictEqual(pace.hopS('recognizer', 0.5, 4), 0.5);
  assert.ok(pace.hopS('recognizer', 0.5, 10) >= 1);
  assert.strictEqual(pace.hopS('recognizer', 0.5), pace.hopS('recognizer', 0.5, 10));
});

test('searchScale: 1 on a fast PC and for short windows; hop ratio once the search is paced', async () => {
  const fast = await paceAt(135);
  assert.strictEqual(fast.searchScale(0.6, 10), 1);
  const slow = await paceAt(330);
  assert.strictEqual(slow.searchScale(0.6, 2), 1);
  assert.ok(slow.searchScale(0.6, 10) > 1.5);
});

test('slow PC: no kirtan pace while a Bani is being followed', async () => {
  const pace = await paceAt(330);
  assert.ok(pace.hopS('recognizer', 0.5, 10) >= 1);
  pace.setBaniFollow(true);
  assert.strictEqual(pace.hopS('recognizer', 0.5, 10), 0.5);
  assert.strictEqual(pace.searchScale(0.5, 10), 1);
  pace.setBaniFollow(false);
  assert.ok(pace.hopS('recognizer', 0.5, 10) >= 1);
});
