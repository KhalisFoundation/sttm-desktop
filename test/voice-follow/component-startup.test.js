// Controlled model readiness is lifecycle evidence, never recognition evidence.
const fs = require('fs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createDriver } = require('./component-driver');
const userData = process.env.VF_BANIDB_USER_DATA;
const baseline = process.env.VF_FROZEN_BASELINE;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
};

async function obsoleteModel(mode, action, source) {
  const entered = deferred();
  const ready = deferred();
  const updates = [];
  let calls = 0;
  let builds = 0;
  let progress;
  const driver = await createDriver({
    userData,
    source,
    initialNavigator: { activeShabadId: 300 },
    onState: (value) => updates.push(value),
    engineOverride: {
      isReady: () => false,
      ready: async (callback) => {
        if (calls++ === 0) {
          progress = callback;
          entered.resolve();
          return ready.promise;
        }
      },
      createRecognizer: async () => {
        builds++;
        return { push: async () => null };
      },
      createFollower: async () => {
        builds++;
        return { push: async () => null };
      },
    },
  });
  try {
    const oldStart = driver.begin(mode);
    await entered.promise;
    await driver.stopSession();
    if (action !== 'stop') await driver.begin(mode);
    const boundary = updates.length;
    const priorBuilds = builds;
    // A stopped/superseded operation must ignore progress as well as completion.
    progress(0.75);
    if (action === 'failure') ready.reject(new Error('Controlled obsolete model failure'));
    else ready.resolve();
    await oldStart;
    return { lateUpdates: updates.slice(boundary), extraBuilds: builds - priorBuilds };
  } finally {
    ready.resolve();
    await driver.stop();
  }
}

for (const mode of ['autopilot', 'detect', 'manual']) {
  for (const action of ['stop', 'restart', 'failure']) {
    test(
      `${mode}: obsolete model ${action} cannot update state or start another engine`,
      { skip: !userData },
      async () => {
        assert.deepEqual(await obsoleteModel(mode, action), { lateUpdates: [], extraBuilds: 0 });
      },
    );
  }
}
test(
  'frozen baseline reproduces model completion starting again after restart',
  { skip: !userData || !baseline },
  async () => {
    const result = await obsoleteModel('autopilot', 'restart', fs.readFileSync(baseline, 'utf8'));
    assert.equal(result.extraBuilds, 1);
    assert.ok(result.lateUpdates.length > 0);
  },
);
