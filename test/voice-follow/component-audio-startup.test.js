const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createDriver } = require('./component-driver');
const userData = process.env.VF_BANIDB_USER_DATA;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
};
async function lateAudio(mode, stage, restart, fail = false) {
  const entered = deferred(),
    release = deferred();
  let requests = 0,
    modules = 0;
  let oldStops = 0,
    newStops = 0,
    builds = 0,
    nodes = 0;
  const updates = [];
  const oldStream = {
    getTracks: () => [
      {
        stop: () => {
          oldStops++;
        },
      },
    ],
  };
  const newStream = {
    getTracks: () => [
      {
        stop: () => {
          newStops++;
        },
      },
    ],
  };
  const driver = await createDriver({
    userData,
    initialNavigator: { activeShabadId: 300 },
    onState: (v) => updates.push(v),
    audioHooks: {
      getUserMedia: async () => {
        if (requests++ === 0) {
          if (stage === 'microphone') {
            entered.resolve();
            return release.promise;
          }
          return oldStream;
        }
        return newStream;
      },
      addModule: async () => {
        if (modules++ === 0 && stage === 'worklet') {
          entered.resolve();
          await release.promise;
        }
      },
      onNodeCreated: () => {
        nodes++;
      },
    },
    engineOverride: {
      ready: async () => {},
      isReady: () => true,
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
    const starting = driver.begin(mode);
    await entered.promise;
    await driver.stopSession();
    if (restart) await driver.begin(mode);
    const boundary = updates.length,
      previousBuilds = builds,
      previousNodes = nodes;
    if (fail) release.reject(new Error('Controlled obsolete audio setup failure'));
    else release.resolve(oldStream);
    await starting;
    return {
      oldStops,
      newStops,
      extraBuilds: builds - previousBuilds,
      extraNodes: nodes - previousNodes,
      lateUpdates: updates.slice(boundary),
    };
  } finally {
    release.resolve(oldStream);
    await driver.stop();
  }
}
for (const mode of ['autopilot', 'detect', 'manual']) {
  for (const restart of [false, true]) {
    test(
      `${mode}: late microphone after ${restart ? 'restart' : 'stop'} is released without installing old work`,
      { skip: !userData },
      async () => {
        assert.deepEqual(await lateAudio(mode, 'microphone', restart), {
          oldStops: 1,
          newStops: 0,
          extraBuilds: 0,
          extraNodes: 0,
          lateUpdates: [],
        });
      },
    );
  }
  test(
    `${mode}: an obsolete worklet load cannot replace a restarted session`,
    { skip: !userData },
    async () => {
      assert.deepEqual(await lateAudio(mode, 'worklet', true), {
        oldStops: 1,
        newStops: 0,
        extraBuilds: 0,
        extraNodes: 0,
        lateUpdates: [],
      });
    },
  );
  for (const stage of ['microphone', 'worklet']) {
    test(
      `${mode}: late ${stage} failure cannot clean up a restarted session`,
      { skip: !userData },
      async () => {
        assert.deepEqual(await lateAudio(mode, stage, true, true), {
          oldStops: stage === 'worklet' ? 1 : 0,
          newStops: 0,
          extraBuilds: 0,
          extraNodes: 0,
          lateUpdates: [],
        });
      },
    );
  }
  for (const fail of [false, true]) {
    test(
      `${mode}: an old engine constructor ${fail ? 'failure' : 'success'} cannot overwrite the restarted engine`,
      { skip: !userData },
      async () => {
        const entered = deferred(),
          release = deferred();
        let builds = 0,
          oldPushes = 0,
          newPushes = 0;
        const oldEngine = {
          push: async () => {
            oldPushes++;
            return null;
          },
        };
        const newEngine = {
          push: async () => {
            newPushes++;
            return null;
          },
        };
        const build = async () => {
          if (builds++ === 0) {
            entered.resolve();
            return release.promise;
          }
          return newEngine;
        };
        const driver = await createDriver({
          userData,
          initialNavigator: { activeShabadId: 300 },
          engineOverride: {
            ready: async () => {},
            isReady: () => true,
            createRecognizer: build,
            createFollower: build,
          },
        });
        try {
          const starting = driver.begin(mode);
          await entered.promise;
          await driver.stopSession();
          await driver.begin(mode);
          if (fail) release.reject(new Error('Controlled obsolete engine construction failure'));
          else release.resolve(oldEngine);
          await starting;
          await driver.push(new Float32Array(2048), 0.128);
          assert.deepEqual({ oldPushes, newPushes }, { oldPushes: 0, newPushes: 1 });
        } finally {
          release.resolve(oldEngine);
          await driver.stop();
        }
      },
    );
  }
}
test(
  'queued PCM from the old audio handler is not fed to the restarted recognizer',
  { skip: !userData },
  async () => {
    const entered = deferred(),
      release = deferred();
    let builds = 0,
      newPushes = 0;
    const driver = await createDriver({
      userData,
      engineOverride: {
        ready: async () => {},
        isReady: () => true,
        createRecognizer: async () =>
          builds++ === 0
            ? {
                push: async () => {
                  entered.resolve();
                  return release.promise;
                },
              }
            : {
                push: async () => {
                  newPushes++;
                  return null;
                },
              },
        createFollower: async () => ({ push: async () => null }),
      },
    });
    try {
      await driver.begin();
      const chunk = new Float32Array(2048);
      const first = driver.push(chunk, 0.128);
      await entered.promise;
      const queued = driver.push(chunk, 0.256);
      await driver.stopSession();
      await driver.begin();
      release.resolve(null);
      await Promise.all([first, queued]);
      assert.equal(newPushes, 0);
      await driver.push(chunk, 0.384);
      assert.equal(newPushes, 1);
    } finally {
      release.resolve(null);
      await driver.stop();
    }
  },
);
