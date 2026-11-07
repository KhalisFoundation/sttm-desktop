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
