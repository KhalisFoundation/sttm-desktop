const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createDriver } = require('./component-driver');
const { rows } = require('./fixtures/canonical-verified.json');
const userData = process.env.VF_BANIDB_USER_DATA;
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

// Use a verbatim, provenance-recorded STTM verse as a search input. This is a
// controlled lifecycle test, not a claim that any audio contains that verse.
for (const mode of ['autopilot', 'detect']) {
  for (const restart of [false, true]) {
    test(
      `${mode}: old query results after ${restart ? 'restart' : 'stop'} cannot update the session`,
      { skip: !userData },
      async () => {
        const entered = deferred(),
          release = deferred();
        const updates = [],
          events = [];
        const driver = await createDriver({
          userData,
          onState: (v) => updates.push(v),
          onEvent: (e) => events.push(e),
          databaseHooks: {
            beforeResult: async (key) => {
              if (key === 'query') {
                entered.resolve();
                await release.promise;
              }
            },
          },
          engineOverride: {
            ready: async () => {},
            isReady: () => true,
            createRecognizer: async () => ({ push: async () => null }),
            createFollower: async () => ({ push: async () => null }),
          },
        });
        try {
          await driver.begin(mode);
          const oldQuery = driver.transcript(rows[0].text, 1);
          await entered.promise;
          driver.cancelSession();
          if (restart) await driver.begin(mode);
          const boundary = updates.length,
            eventBoundary = events.length;
          const before = JSON.stringify(driver.snapshot());
          release.resolve();
          await oldQuery;
          assert.deepEqual(updates.slice(boundary), []);
          assert.equal(JSON.stringify(driver.snapshot()), before);
          assert.deepEqual(
            events
              .slice(eventBoundary)
              .filter((e) => ['shabad', 'verse', 'seeking'].includes(e.type)),
            [],
          );
          if (restart) {
            await driver.transcript(rows[0].text, 2);
            assert.ok(
              driver.snapshot().votes.length > 0,
              'current-session queries still contribute evidence',
            );
          }
        } finally {
          release.resolve();
          await driver.stop();
        }
      },
    );
  }
}
