const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { createDriver, COMPONENT } = require('./component-driver');
const { rows } = require('./fixtures/canonical-verified.json');
const userData = process.env.VF_BANIDB_USER_DATA;

test(
  'active backstop survives its canonical profile being evicted and reloaded',
  { skip: !userData },
  async (t) => {
    // Exercise ordinary cache eviction with a one-entry capacity. The hypothesis
    // is an exact verified canonical fixture; it is not invented training text.
    let source = fs.readFileSync(process.env.VF_CACHE_SOURCE || COMPONENT, 'utf8');
    for (const [from, to] of [
      ['const BACKSTOP_CACHE_MAX = 300;', 'const BACKSTOP_CACHE_MAX = 1;'],
      ['const BACKSTOP_MAX_LOADS = 3;', 'const BACKSTOP_MAX_LOADS = 1;'],
    ]) {
      assert.equal(source.split(from).length, 2);
      source = source.replace(from, to);
    }
    const current = rows[0],
      target = rows[2],
      events = [];
    let includeOther = false;
    const driver = await createDriver({
      source,
      userData,
      onEvent: (e) => events.push(e),
      engineOverride: {
        ready: async () => {},
        isReady: () => true,
        createRecognizer: async () => ({ push: async () => null }),
        createFollower: async () => ({ push: async () => null }),
      },
      retrievalHooks: {
        createClient: () => ({
          ready: Promise.resolve(),
          dispose: async () => {},
          search: async () => [
            { shabadId: target.shabadId, verseId: target.verseId, score: 1 },
            ...(includeOther ? [{ shabadId: 4377, verseId: 52522, score: 0.5 }] : []),
          ],
        }),
      },
    });
    t.after(() => driver.stop());
    await driver.begin();
    await driver.lock({
      shabadId: current.shabadId,
      verseId: current.verseId,
      verse: current.ascii,
    });
    await driver.transcript(current.text, 1); // Populate target profile.
    await driver.transcript(current.text, 2); // Adopt target into the active slot.
    assert.equal(driver.snapshot().backstop.id, target.shabadId);
    const initialBackstop = driver.snapshot().backstop;
    includeOther = true;
    await driver.transcript(current.text, 3); // Evict target, retain its live slot.
    assert.deepEqual(driver.snapshot().backstop, initialBackstop);
    await driver.transcript(current.text, 4); // Reload target: cache entry is pending.
    assert.equal(driver.snapshot().current, current.shabadId);
    assert.equal(driver.snapshot().backstop.id, target.shabadId);
    assert.deepEqual(driver.snapshot().backstop, initialBackstop);
    assert.equal(driver.snapshot().cacheSize, 1);
    assert.equal(
      events.filter((e) => e.type === 'shabad').length,
      1,
      'unrelated lookup must not project',
    );
  },
);
