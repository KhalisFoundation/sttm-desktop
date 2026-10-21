const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
  createUtilityWorker,
} = require('../../www/main/addons/voice-follow/engine/retrieval/utility-worker');

test('cancellation before helper spawn kills after spawn and waits for actual exit', async () => {
  const child = new EventEmitter();
  let spawned = false,
    kills = 0;
  child.kill = () => {
    kills++;
    return spawned;
  };
  const worker = createUtilityWorker(
    '/owned/worker.js',
    { workerData: { userData: '/owned/database' } },
    {
      fork: (file, args, options) => {
        assert.equal(file, '/owned/worker.js');
        assert.deepEqual(args, ['/owned/database']);
        assert.equal(options.serviceName, 'Voice Follow canonical retrieval');
        return child;
      },
    },
  );
  const pending = worker.terminate();
  let resolved = false;
  pending.then(() => {
    resolved = true;
  });
  assert.equal(kills, 1);
  assert.equal(resolved, false);
  spawned = true;
  child.emit('spawn');
  assert.equal(kills, 2);
  child.emit('exit', 0);
  assert.equal(await pending, 0);
  assert.equal(worker.terminate(), pending);
  assert.equal(kills, 2);
});

test('unexpected helper exit is terminal and later disposal resolves without hanging', async () => {
  const child = new EventEmitter();
  child.kill = () => false;
  const worker = createUtilityWorker(
    '/owned/worker.js',
    { workerData: { userData: '/owned/database' } },
    {
      fork: () => child,
    },
  );
  child.emit('exit', 134);
  assert.equal(await worker.terminate(), 134);
});

test('helper startup exceptions propagate to the lifecycle client', () => {
  assert.throws(
    () =>
      createUtilityWorker(
        '/owned/worker.js',
        { workerData: { userData: '/owned/database' } },
        {
          fork: () => {
            throw new Error('helper missing');
          },
        },
      ),
    /helper missing/,
  );
});
