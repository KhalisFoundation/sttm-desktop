// Unit tests for warmIndex.js — run with: node --test www/main/addons/voice-follow/components/
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createWarmIndex } = require('./warmIndex');

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
const tick = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

function fixture() {
  const clients = [];
  const ready = [];
  const errors = [];
  let t = 1000;
  const warm = createWarmIndex({
    create: () => {
      const d = deferred();
      const c = { ready: d.promise, disposed: 0, dispose: async () => c.disposed++, d };
      clients.push(c);
      return c;
    },
    onReady: (info) => ready.push(info),
    onError: (e) => errors.push(e.message),
    now: () => t,
  });
  const advance = (ms) => {
    t += ms;
  };
  return { warm, clients, ready, errors, tick: advance };
}

describe('warmIndex', () => {
  it('builds once and hands the same client to every caller', async () => {
    const f = fixture();
    const a = f.warm.ensure();
    const b = f.warm.ensure();
    assert.equal(f.clients.length, 1, 'one build for concurrent callers');
    f.tick(2500);
    f.clients[0].d.resolve({ rows: 7 });
    assert.equal(await a, f.clients[0]);
    assert.equal(await b, f.clients[0]);
    assert.equal(f.warm.get(), f.clients[0]);
    assert.equal(await f.warm.ensure(), f.clients[0], 'later callers reuse the warm client');
    assert.equal(f.clients.length, 1);
    assert.deepEqual(f.ready, [{ ms: 2500, rows: 7, builds: 1 }]);
    assert.equal(f.clients[0].disposed, 0, 'never disposed between runs');
  });

  it('a failed build is disposed, remembered, and retried on the next ensure', async () => {
    const f = fixture();
    const p = f.warm.ensure();
    f.clients[0].d.reject(new Error('Canonical retrieval preparation failed'));
    assert.equal(await p, null);
    assert.equal(f.warm.get(), null);
    assert.equal(f.warm.failedAt(), 1000);
    assert.equal(f.clients[0].disposed, 1);
    assert.deepEqual(f.errors, ['Canonical retrieval preparation failed']);
    const again = f.warm.ensure();
    assert.equal(f.clients.length, 2, 'no backoff inside the module: the caller gates');
    f.clients[1].d.resolve({ rows: 3 });
    assert.equal(await again, f.clients[1]);
    assert.equal(f.warm.failedAt(), 0, 'a success clears the failure');
  });

  it('reset during a build discards that build and a later ensure starts fresh', async () => {
    const f = fixture();
    const p = f.warm.ensure();
    f.warm.reset();
    f.clients[0].d.resolve({ rows: 7 });
    assert.equal(await p, null, 'an obsolete build never becomes the warm client');
    assert.equal(f.clients[0].disposed, 1);
    assert.equal(f.warm.get(), null);
    assert.equal(f.warm.failedAt(), 0, 'reset is not a failure');
    const next = f.warm.ensure();
    f.clients[1].d.resolve({ rows: 7 });
    assert.equal(await next, f.clients[1]);
    assert.equal(f.ready.length, 1);
  });

  it('reset after a build releases the client (database changed / window unload)', async () => {
    const f = fixture();
    const p = f.warm.ensure();
    f.clients[0].d.resolve({ rows: 7 });
    await p;
    f.warm.reset();
    await tick();
    assert.equal(f.clients[0].disposed, 1);
    assert.equal(f.warm.get(), null);
  });

  it('fail() on the warm client drops it and marks the failure; a stale client is ignored', async () => {
    const f = fixture();
    const p = f.warm.ensure();
    f.clients[0].d.resolve({ rows: 7 });
    const c = await p;
    f.tick(10);
    f.warm.fail(c);
    assert.equal(f.warm.get(), null);
    assert.equal(c.disposed, 1);
    assert.equal(f.warm.failedAt(), 1010);
    const next = f.warm.ensure();
    f.clients[1].d.resolve({ rows: 7 });
    await next;
    f.tick(10);
    f.warm.fail(c); // the old one again: must not touch the new warm client
    assert.equal(f.warm.get(), f.clients[1]);
    assert.equal(f.warm.failedAt(), 0);
  });
});
