// Exact canonical inputs with controlled retrieval rankings. These are decision
// regressions, not acoustic accuracy tests or audio-reviewed labels.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const repo = process.env.VF_TEST_REPO || path.resolve(__dirname, '../..');
const { createDriver, COMPONENT } = require(path.join(repo, 'test/voice-follow/component-driver'));
const { readCorpus } = require(path.join(repo, 'test/voice-follow/canonical-corpus'));
const userData = process.env.VF_BANIDB_USER_DATA;
let canonicalPromise;
const candidate = (row) => ({ shabadId: row.shabadId, verseId: row.verseId, score: 1 });
async function canonicalRows() {
  if (!canonicalPromise)
    canonicalPromise = readCorpus(userData).then((rows) => {
      const byId = new Map(rows.map((row) => [row.verseId, row]));
      const shared = [284, 404, 15802].map((id) => byId.get(id));
      const current = byId.get(15269),
        unique = byId.get(4132);
      assert.ok(shared.every(Boolean) && current && unique);
      assert.ok(shared.every((row) => row.text === shared[0].text));
      assert.equal(new Set(shared.map((row) => row.shabadId)).size, 3);
      assert.ok(!shared.some((row) => [current.shabadId, unique.shabadId].includes(row.shabadId)));
      assert.notEqual(current.shabadId, unique.shabadId);
      return { shared, current, unique };
    });
  return canonicalPromise;
}
async function fixture(t, search) {
  const events = [];
  const source = fs.readFileSync(process.env.VF_AMBIGUITY_SOURCE || COMPONENT, 'utf8');
  const driver = await createDriver({
    source,
    userData,
    onEvent: (event) => events.push(event),
    engineOverride: {
      ready: async () => {},
      isReady: () => true,
      createRecognizer: async () => ({ push: async () => null }),
      createFollower: async () => ({ push: async () => null }),
    },
    retrievalHooks: {
      createClient: () => ({ ready: Promise.resolve(), dispose: async () => {}, search }),
    },
  });
  t.after(() => driver.stop());
  await driver.begin();
  return { driver, events };
}
const lock = (driver, row) =>
  driver.lock({ shabadId: row.shabadId, verseId: row.verseId, verse: row.ascii });
for (const phase of ['searching', 'following'])
  for (const reverse of [false, true]) {
    test(
      `equal canonical wording holds ${phase} regardless of shortlist order ${reverse}`,
      { skip: !userData },
      async (t) => {
        const { shared, current } = await canonicalRows();
        const shortlist = (reverse ? shared.slice().reverse() : shared).map(candidate);
        const { driver, events } = await fixture(t, async () => shortlist);
        if (phase === 'following') await lock(driver, current);
        const boundary = events.length;
        for (let i = 1; i <= 8; i++) await driver.transcript(shared[0].text, i * 0.5);
        assert.equal(driver.snapshot().current, phase === 'following' ? current.shabadId : null);
        assert.deepEqual(
          events.slice(boundary).filter((event) => event.type === 'shabad'),
          [],
        );
      },
    );
  }
for (const phase of ['searching', 'following']) {
  test(`single-candidate control can acquire while ${phase}`, { skip: !userData }, async (t) => {
    const { unique, current } = await canonicalRows();
    const { driver } = await fixture(t, async () => [candidate(unique)]);
    if (phase === 'following') await lock(driver, current);
    for (let i = 1; i <= 8; i++) await driver.transcript(unique.text, i * 0.5);
    assert.equal(driver.snapshot().current, unique.shabadId);
  });
}
test(
  'unrelated tied leaders do not discard a distinct nominees evidence',
  { skip: !userData },
  async (t) => {
    const { shared, unique, current } = await canonicalRows();
    // Deliberately supplied ranks; no claim that the real index returns these
    // scores for this exact canonical input, or that a full-corpus match is unique.
    const shortlist = [...shared.slice(0, 2).map(candidate), { ...candidate(unique), score: 0.8 }];
    const { driver } = await fixture(t, async () => shortlist);
    await lock(driver, current);
    for (let i = 1; i <= 8; i++) await driver.transcript(unique.text, i * 0.5);
    assert.equal(driver.snapshot().current, unique.shabadId);
  },
);
test(
  'a tied nominee loses prior wins and needs fresh confirming decodes',
  { skip: !userData },
  async (t) => {
    const { shared, unique, current } = await canonicalRows();
    let tied = false;
    const { driver } = await fixture(t, async () =>
      tied ? [candidate(unique), candidate(shared[0])] : [candidate(unique)],
    );
    await lock(driver, current);
    await driver.transcript(unique.text, 0.5);
    await driver.transcript(unique.text, 1);
    const before = driver.snapshot();
    assert.equal(before.current, current.shabadId);
    assert.ok(
      [before.vote, before.backstop].some((slot) => slot?.id === unique.shabadId && slot.wins > 0),
    );
    tied = true;
    await driver.transcript(unique.text, 1.5);
    const held = driver.snapshot();
    assert.equal(held.current, current.shabadId);
    for (const slot of [held.vote, held.backstop])
      if (slot?.id === unique.shabadId) assert.equal(slot.wins, 0);
    tied = false;
    await driver.transcript(unique.text, 2);
    assert.equal(
      driver.snapshot().current,
      current.shabadId,
      'old wins must not cause immediate confirmation',
    );
    await driver.transcript(unique.text, 2.5);
    assert.equal(
      driver.snapshot().current,
      unique.shabadId,
      'fresh unambiguous shortlist evidence can confirm',
    );
  },
);
