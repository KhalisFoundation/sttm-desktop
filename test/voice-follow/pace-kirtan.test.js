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

test('slow PC: the search is paced from its first pass (window pacing is bench-only)', async () => {
  const pace = await paceAt(330);
  assert.ok(pace.hopS('recognizer', 0.5, 2) >= 1);
  assert.strictEqual(pace.hopS('recognizer', 0.5, 2), pace.hopS('recognizer', 0.5, 10));
});

test('searchScale: 1 on a fast PC and for short windows; hop ratio once the search is paced', async () => {
  const fast = await paceAt(135);
  assert.strictEqual(fast.searchScale(0.6, 10), 1);
  const slow = await paceAt(330);
  assert.ok(slow.searchScale(0.6, 10) > 1.5);
});

test("Renton-class self-tests up to 250 ms keep today's kirtan schedule", async () => {
  const pace = await paceAt(210);
  assert.deepStrictEqual(hops(pace), [0.5, 0.25]);
  for (let k = 0; k < 8; k += 1) pace.notePass(400, 4 * 16000);
  for (let t = 0; t <= 300000; t += 500) pace.observe(3, 1e6 + t);
  assert.deepStrictEqual(hops(pace), [0.5, 0.25]);
  assert.strictEqual(pace.searchScale(0.5, 10), 1);
});

test("the slowest PCs (self-test above 450 ms) keep today's kirtan schedule", async () => {
  const pace = await paceAt(520);
  assert.deepStrictEqual(hops(pace), [0.5, 0.25]);
  assert.strictEqual(pace.searchScale(0.5, 10), 1);
});

test('laptop (self-test 140 ms, live 360 ms for 40 s): live trigger paces kirtan for the rest of the session', async () => {
  const pace = await paceAt(140);
  assert.deepStrictEqual(hops(pace), [0.5, 0.25]);
  for (let k = 0; k < 100; k += 1) pace.notePass(360, 4 * 16000);
  pace.observe(0, 1e6); // too few passes yet
  assert.deepStrictEqual(hops(pace), [0.5, 0.25]);
  for (let k = 0; k < 140; k += 1) pace.notePass(360, 4 * 16000);
  pace.observe(0, 1e6 + 1000);
  assert.deepStrictEqual(hops(pace), [1, 0.375]);
  for (let k = 0; k < 240; k += 1) pace.notePass(120, 4 * 16000); // cooled down: stays paced
  pace.observe(0, 1e6 + 120000);
  assert.deepStrictEqual(hops(pace), [1, 0.375]);
});

test('Renton-class (self-test 135 ms, live 150 ms with spikes, backlog): today\'s kirtan hops all session', async () => {
  const pace = await paceAt(135);
  for (let t = 0; t <= 600000; t += 500) {
    pace.notePass(t % 5000 === 0 ? 900 : 150, 4 * 16000);
    pace.observe(t % 20000 < 4000 ? 1.5 : 0, 1e6 + t);
  }
  assert.deepStrictEqual(hops(pace), [0.5, 0.25]);
});

test('live 320 ms (under the 330 ms trigger, above Renton\'s worst 317) keeps today\'s kirtan hops', async () => {
  const pace = await paceAt(140);
  for (let k = 0; k < 240; k += 1) pace.notePass(320, 4 * 16000);
  pace.observe(0, 1e6);
  assert.deepStrictEqual(hops(pace), [0.5, 0.25]);
});

test('VF_KIRTAN_LIVE=0 keeps the self-test-only rule', async () => {
  process.env.VF_KIRTAN_LIVE = '0';
  try {
    const pace = await paceAt(140);
    for (let k = 0; k < 240; k += 1) pace.notePass(400, 4 * 16000);
    pace.observe(0, 1e6);
    assert.deepStrictEqual(hops(pace), [0.5, 0.25]);
  } finally {
    delete process.env.VF_KIRTAN_LIVE;
  }
});

test('live trigger paces the search, never the Bani follower', async () => {
  const pace = await paceAt(140);
  for (let k = 0; k < 240; k += 1) pace.notePass(360, 4 * 16000);
  pace.observe(0, 1e6);
  assert.strictEqual(pace.hopS('recognizer', 0.5, 10), 1);
  assert.strictEqual(pace.hopS('bani', 0.25), 0.25);
});

test('live trigger stops at the 450 ms cap: a laptop at 520 ms live keeps today\'s kirtan hops', async () => {
  const pace = await paceAt(140);
  for (let k = 0; k < 240; k += 1) pace.notePass(520, 4 * 16000);
  pace.observe(0, 1e6);
  assert.deepStrictEqual(hops(pace), [0.5, 0.25]);
});

test('live trigger reports once when it latches (perf_tier reason kirtan-live)', async () => {
  const pace = await paceAt(140);
  const seen = [];
  pace.onStep((ev) => seen.push(ev));
  for (let k = 0; k < 240; k += 1) pace.notePass(360, 4 * 16000);
  pace.observe(0, 1e6);
  pace.observe(0, 1e6 + 1000);
  assert.strictEqual(seen.length, 1);
  assert.strictEqual(seen[0].reason, 'kirtan-live');
  assert.strictEqual(seen[0].liveMedianMs, 360);
});
