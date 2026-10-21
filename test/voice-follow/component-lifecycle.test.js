// Controlled async completions exercise the actual component, not ASR accuracy.
const fs = require('fs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createDriver } = require('./component-driver');
const { rows } = require('./fixtures/canonical-verified.json');
const userData = process.env.VF_BANIDB_USER_DATA;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
};
async function runLateCompletion(action, source) {
  const entered = deferred();
  const release = deferred();
  const events = [];
  let followers = 0;
  const driver = await createDriver({
    userData,
    source,
    initialNavigator: { activeShabadId: 300 },
    onEvent: (e) => events.push(e),
    engineOverride: {
      ready: async () => {},
      isReady: () => true,
      createRecognizer: async () => ({ push: async () => null }),
      createFollower: async () => {
        const first = followers++ === 0;
        return {
          push: async () => {
            if (!first) return null;
            entered.resolve();
            return release.promise;
          },
        };
      },
    },
  });
  const a = rows.find((row) => row.verseId === 4132);
  const b = rows.find((row) => row.verseId === 15269);
  const candidate = (row) => ({ shabadId: row.shabadId, verseId: row.verseId, verse: row.ascii });
  try {
    if (action === 'manual-stop') await driver.startManual();
    else {
      await driver.start();
      await driver.lock(candidate(a));
    }
    const pushing = driver.push(new Float32Array(2048), 1.024);
    await entered.promise;
    if (action === 'switch') await driver.lock(candidate(b));
    else if (action === 'stop' || action === 'manual-stop') await driver.stopSession();
    const boundary = events.length;
    release.resolve({
      lineIndex: 1,
      verseIndex: 1,
      verseId: a.verseId,
      wordIndex: 0,
      confidence: 1,
    });
    await pushing;
    return events.slice(boundary).filter((e) => e.type === 'verse');
  } finally {
    release.resolve(null);
    await driver.stop();
  }
}
test(
  'a replaced follower cannot move the new Shabad using its late result',
  { skip: !userData },
  async () => {
    assert.deepEqual(await runLateCompletion('switch'), []);
  },
);
test(
  'a stopped follower cannot update the projector after stopping',
  { skip: !userData },
  async () => {
    assert.deepEqual(await runLateCompletion('stop'), []);
  },
);
test('manual follow also ignores results arriving after stop', { skip: !userData }, async () => {
  assert.deepEqual(await runLateCompletion('manual-stop'), []);
});
test('a current follower still moves the verse normally', { skip: !userData }, async () => {
  const moves = await runLateCompletion('keep');
  assert.equal(moves.length, 1);
  assert.equal(moves[0].verseId, 4132);
});
test(
  'frozen baseline reproduces the stale follower overwrite',
  { skip: !userData || !process.env.VF_FROZEN_BASELINE },
  async () => {
    const stale = await runLateCompletion(
      'switch',
      fs.readFileSync(process.env.VF_FROZEN_BASELINE, 'utf8'),
    );
    assert.equal(stale.length, 1);
    assert.equal(stale[0].verseId, 4132);
  },
);

async function finishOldLockAfterRestart(fails, source) {
  const entered = deferred();
  const build = deferred();
  const events = [];
  let builds = 0;
  const follower = { push: async () => null };
  const driver = await createDriver({
    userData,
    source,
    onEvent: (e) => events.push(e),
    engineOverride: {
      ready: async () => {},
      isReady: () => true,
      createRecognizer: async () => ({ push: async () => null }),
      createFollower: async () => {
        if (builds++ === 0) {
          entered.resolve();
          return build.promise;
        }
        return follower;
      },
    },
  });
  const candidate = (id) => {
    const r = rows.find((row) => row.verseId === id);
    return { shabadId: r.shabadId, verseId: r.verseId, verse: r.ascii };
  };
  try {
    await driver.start();
    const oldLock = driver.lock(candidate(4132));
    await entered.promise;
    await driver.stopSession();
    await driver.start();
    await driver.lock(candidate(15269));
    const boundary = events.length;
    if (fails) build.reject(new Error('Controlled obsolete follower initialization failure'));
    else build.resolve(follower);
    await oldLock;
    return {
      snapshot: driver.snapshot(),
      commits: events.slice(boundary).filter((e) => e.type === 'shabad'),
    };
  } finally {
    build.resolve(follower);
    await driver.stop();
  }
}
test(
  'an old lock cannot replace the Shabad acquired in a restarted session',
  { skip: !userData },
  async () => {
    const result = await finishOldLockAfterRestart(false);
    assert.equal(result.snapshot.current, 1341);
    assert.deepEqual(result.commits, []);
  },
);
test(
  'an old lock failure cannot reset a restarted session to searching',
  { skip: !userData },
  async () => {
    const result = await finishOldLockAfterRestart(true);
    assert.equal(result.snapshot.phase, 'following');
    assert.equal(result.snapshot.current, 1341);
  },
);
test(
  'frozen baseline reproduces an old lock committing into the restarted session',
  { skip: !userData || !process.env.VF_FROZEN_BASELINE },
  async () => {
    const result = await finishOldLockAfterRestart(
      false,
      fs.readFileSync(process.env.VF_FROZEN_BASELINE, 'utf8'),
    );
    assert.equal(result.snapshot.current, 300);
    assert.equal(result.commits.length, 1);
  },
);
