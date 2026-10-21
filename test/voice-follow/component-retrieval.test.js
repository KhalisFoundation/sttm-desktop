const test = require('node:test');
const assert = require('node:assert/strict');
const { createDriver } = require('./component-driver');
const { rows } = require('./fixtures/canonical-verified.json');
const userData = process.env.VF_BANIDB_USER_DATA;
const canonical = rows[0];
const nominee = { shabadId: canonical.shabadId, verseId: canonical.verseId, score: 1 };
const candidate = (row) => ({ shabadId: row.shabadId, verseId: row.verseId, verse: row.ascii });
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function fixture(
  t,
  { search, ready = Promise.resolve({ rows: rows.length }), databaseHooks = {} } = {},
) {
  const events = [],
    states = [],
    clients = [];
  const driver = await createDriver({
    userData,
    onEvent: (e) => events.push(e),
    onState: (x) => states.push(x),
    databaseHooks,
    engineOverride: {
      ready: async () => {},
      isReady: () => true,
      createRecognizer: async () => ({ push: async () => null }),
      createFollower: async () => ({ push: async () => null }),
    },
    retrievalHooks: {
      createClient: () => {
        const client = {
          ready: typeof ready === 'function' ? ready(clients.length) : ready,
          state: 'ready',
          searches: [],
          disposed: 0,
          search: async (text, cap, options) => {
            client.searches.push({ cap, signal: options.signal });
            return search ? search(text, cap, options) : [nominee];
          },
          dispose: async () => {
            client.disposed++;
          },
        };
        clients.push(client);
        return client;
      },
    },
  });
  t.after(() => driver.stop());
  return { driver, events, states, clients };
}
const projections = (events) =>
  events.filter((e) => ['shabad', 'verse', 'seeking'].includes(e.type));

for (const restart of [false, true]) {
  test(
    `late initial text result after ${restart ? 'restart' : 'stop'} cannot project or update state`,
    { skip: !userData },
    async (t) => {
      const entered = deferred(),
        result = deferred();
      const { driver, events, states, clients } = await fixture(t, {
        search: () => {
          entered.resolve();
          return result.promise;
        },
      });
      await driver.begin();
      const old = driver.transcript(canonical.text, 2);
      await entered.promise;
      driver.cancelSession();
      if (restart) await driver.begin();
      const boundary = states.length,
        before = JSON.stringify(driver.snapshot()),
        e = events.length;
      result.resolve([nominee]);
      await old;
      assert.deepEqual(states.slice(boundary), []);
      assert.equal(JSON.stringify(driver.snapshot()), before);
      assert.deepEqual(projections(events.slice(e)), []);
      assert.equal(clients[0].searches[0].signal.aborted, true);
      assert.equal(clients[0].disposed, 1);
      if (restart) {
        await driver.transcript(canonical.text, 3);
        await driver.transcript(canonical.text, 4);
        assert.equal(driver.snapshot().current, canonical.shabadId, 'fresh session can acquire');
      }
    },
  );
}

test(
  'newer decode rejecting a nominee cannot be overridden by an older matching result',
  { skip: !userData },
  async (t) => {
    const entered = deferred(),
      oldResult = deferred();
    let calls = 0;
    const { driver, events } = await fixture(t, {
      search: () => {
        calls++;
        if (calls === 1) {
          entered.resolve();
          return oldResult.promise;
        }
        return [];
      },
    });
    await driver.begin();
    const older = driver.transcript(canonical.text, 2);
    await entered.promise;
    await driver.transcript(canonical.text, 3);
    oldResult.resolve([nominee]);
    await older;
    assert.equal(driver.snapshot().current, null);
    assert.deepEqual(projections(events), []);
  },
);

test(
  'late following retrieval cannot score or switch a replacement Shabad',
  { skip: !userData },
  async (t) => {
    const entered = deferred(),
      result = deferred();
    const { driver, events, states } = await fixture(t, {
      search: () => {
        entered.resolve();
        return result.promise;
      },
    });
    await driver.begin();
    await driver.lock(candidate(canonical));
    const old = driver.transcript(rows[2].text, 1);
    await entered.promise;
    await driver.lock(candidate(rows[2]));
    const boundary = states.length,
      e = events.length,
      before = JSON.stringify(driver.snapshot());
    result.resolve([nominee]);
    await old;
    assert.equal(JSON.stringify(driver.snapshot()), before);
    assert.deepEqual(states.slice(boundary), []);
    assert.deepEqual(projections(events.slice(e)), []);
  },
);

test('tied canonical leaders do not automatically acquire', { skip: !userData }, async (t) => {
  const { driver } = await fixture(t, {
    search: () => [nominee, { shabadId: rows[2].shabadId, verseId: rows[2].verseId, score: 1 }],
  });
  await driver.begin();
  await driver.transcript(canonical.text, 1);
  await driver.transcript(canonical.text, 2);
  assert.equal(driver.snapshot().current, null);
});

test(
  'preparation completing after stop is disposed without publishing a ready index',
  { skip: !userData },
  async (t) => {
    const preparation = deferred();
    const { driver, clients, states } = await fixture(t, { ready: preparation.promise });
    await driver.begin();
    driver.cancelSession();
    const boundary = states.length;
    preparation.resolve({ rows: rows.length });
    await tick();
    assert.equal(driver.snapshot().retrievalReady, false);
    assert.equal(clients[0].disposed, 1);
    assert.deepEqual(states.slice(boundary), []);
  },
);

test(
  'old preparation failure cannot clear a replacement service or its readiness',
  { skip: !userData },
  async (t) => {
    const old = deferred(),
      fresh = deferred();
    const { driver, clients } = await fixture(t, {
      ready: (index) => (index === 0 ? old.promise : fresh.promise),
    });
    await driver.begin();
    driver.cancelSession();
    await driver.begin();
    old.resolve(Promise.reject(new Error('obsolete preparation')));
    await tick();
    fresh.resolve({ rows: rows.length });
    await tick();
    assert.equal(driver.snapshot().retrievalReady, true);
    await driver.transcript(canonical.text, 1);
    await driver.transcript(canonical.text, 2);
    assert.equal(driver.snapshot().current, canonical.shabadId);
    assert.equal(clients[1].disposed, 0);
  },
);

test(
  'late profile loads cannot repopulate the cache of a restarted session',
  { skip: !userData },
  async (t) => {
    const entered = deferred(),
      release = deferred();
    const { driver } = await fixture(t, {
      search: () => [{ shabadId: rows[2].shabadId, verseId: rows[2].verseId, score: 1 }],
      databaseHooks: {
        beforeResult: async (key, args) => {
          if (key === 'loadShabad' && args[0] === rows[2].shabadId) {
            entered.resolve();
            await release.promise;
          }
        },
      },
    });
    await driver.begin();
    await driver.lock(candidate(canonical));
    const old = driver.transcript(rows[2].text, 1);
    await entered.promise;
    driver.cancelSession();
    await driver.begin();
    release.resolve();
    await old;
    assert.equal(driver.snapshot().cacheSize, 0);
    assert.equal(driver.snapshot().current, null);
  },
);

test(
  'preparation failure holds automatic projection and disposes the failed service',
  { skip: !userData },
  async (t) => {
    const preparation = deferred();
    const { driver, clients, events } = await fixture(t, { ready: preparation.promise });
    await driver.begin();
    preparation.resolve(Promise.reject(new Error('fixture unavailable')));
    await tick();
    await driver.transcript(canonical.text, 1);
    await driver.transcript(canonical.text, 2);
    assert.equal(driver.snapshot().current, null);
    assert.deepEqual(projections(events), []);
    assert.equal(
      clients.length,
      1,
      'failed preparation must back off rather than respawn every decode',
    );
    assert.equal(clients[0].disposed, 1);
  },
);
