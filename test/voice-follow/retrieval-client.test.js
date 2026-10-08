const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { RetrievalClient } = require('../../www/main/addons/voice-follow/engine/retrieval/client');
const { rows } = require('./fixtures/canonical-verified.json');
const canonical = rows[0];
const candidate = { shabadId: canonical.shabadId, verseId: canonical.verseId, score: 1 };
const tick = () => new Promise((resolve) => setImmediate(resolve));
class FakeWorker extends EventEmitter {
  constructor() {
    super();
    this.sent = [];
    this.terminations = 0;
  }
  postMessage(message) {
    this.sent.push(message);
  }
  terminate() {
    this.terminations++;
    return Promise.resolve(0);
  }
  ready() {
    this.emit('message', { ready: true, rows: 3 });
  }
  answer(id, candidates = [candidate]) {
    this.emit('message', { id, candidates });
  }
}
function setup(t, options = {}) {
  const worker = new FakeWorker();
  const client = new RetrievalClient('/unused-in-mock', {
    workerFactory: () => worker,
    ...options,
  });
  t.after(() => client.dispose());
  return { worker, client };
}
test('preparation keeps requests pending; out-of-order responses reach their own callers', async (t) => {
  const { worker, client } = setup(t);
  const a = client.search(canonical.text, 1);
  const b = client.search(rows[1].text, 2);
  await tick();
  assert.equal(worker.sent.length, 0);
  worker.ready();
  await tick();
  assert.deepEqual(
    worker.sent.map((m) => m.cap),
    [1, 2],
  );
  worker.answer(1, []);
  worker.answer(0);
  assert.deepEqual(await a, [candidate]);
  assert.deepEqual(await b, []);
  assert.equal(client.pending.size, 0);
});
test('session abort during preparation settles immediately and sends no stale query', async (t) => {
  const { worker, client } = setup(t);
  const controller = new AbortController();
  const pending = client.search(canonical.text, 2, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  worker.ready();
  await tick();
  assert.equal(worker.sent.length, 0);
  const next = client.search(canonical.text);
  await tick();
  worker.answer(1);
  assert.deepEqual(await next, [candidate]);
});
test('session abort after dispatch ignores late results and leaves new session usable', async (t) => {
  const { worker, client } = setup(t);
  worker.ready();
  const controller = new AbortController();
  const old = client.search(canonical.text, 2, { signal: controller.signal });
  await tick();
  controller.abort();
  await assert.rejects(old, { name: 'AbortError' });
  const next = client.search(canonical.text);
  await tick();
  worker.answer(0);
  assert.equal(client.pending.size, 1);
  worker.answer(1);
  assert.deepEqual(await next, [candidate]);
});
test('disposing during startup rejects readiness and searches, and terminates once', async (t) => {
  const { worker, client } = setup(t);
  const ready = assert.rejects(client.ready, /closed/);
  const search = assert.rejects(client.search(canonical.text), /closed/);
  await client.dispose();
  await client.dispose();
  await ready;
  await search;
  worker.ready();
  worker.answer(0);
  await assert.rejects(client.search(canonical.text), /closed/);
  assert.equal(worker.terminations, 1);
  assert.equal(worker.sent.length, 0);
});
test('unexpected clean worker exit settles in-flight callers and prevents further work', async (t) => {
  const { worker, client } = setup(t);
  worker.ready();
  const a = assert.rejects(client.search(canonical.text), /exited/);
  const b = assert.rejects(client.search(canonical.text), /exited/);
  await tick();
  worker.emit('exit', 0);
  await a;
  await b;
  await assert.rejects(client.search(canonical.text), /exited/);
  assert.equal(client.pending.size, 0);
});
test('native worker errors and startup protocol errors reject without leaking payload text', async (t) => {
  const one = setup(t);
  one.worker.emit('error', new Error('private payload'));
  await assert.rejects(one.client.ready, { message: 'Canonical retrieval worker failed' });
  const two = setup(t);
  two.worker.emit('message', { error: 'private payload' });
  await assert.rejects(two.client.ready, { message: 'Canonical retrieval preparation failed' });
});
test('constructor failure is observable through readiness', async (t) => {
  const { client } = setup(t, {
    workerFactory: () => {
      throw new Error('native loading error');
    },
  });
  await assert.rejects(client.ready, /could not start/);
});
test('startup timeout terminates unresponsive preparation and settles queued search', async (t) => {
  const { worker, client } = setup(t, { startupTimeoutMs: 15 });
  await assert.rejects(client.search(canonical.text), /preparation timed out/);
  assert.equal(worker.terminations, 1);
  assert.equal(client.pending.size, 0);
});
test('query timeout terminates worker and settles every outstanding request', async (t) => {
  const { worker, client } = setup(t, { queryTimeoutMs: 15 });
  worker.ready();
  await Promise.all([
    assert.rejects(client.search(canonical.text), /search timed out/),
    assert.rejects(client.search(canonical.text), /search timed out/),
  ]);
  assert.equal(worker.terminations, 1);
  assert.equal(client.pending.size, 0);
});
test('bounded queue rejects overflow without dropping an accepted request', async (t) => {
  const { worker, client } = setup(t, { maxPending: 1 });
  worker.ready();
  const accepted = client.search(canonical.text);
  await assert.rejects(client.search(canonical.text), /queue is full/);
  await tick();
  worker.answer(0);
  assert.deepEqual(await accepted, [candidate]);
});
test('invalid candidates fail closed; valid responses expose only IDs and scores', async (t) => {
  const one = setup(t);
  one.worker.ready();
  const a = one.client.search(canonical.text);
  await tick();
  one.worker.answer(0, [{ ...candidate, text: canonical.text }]);
  assert.deepEqual(await a, [candidate]);
  const b = one.client.search(canonical.text);
  await tick();
  one.worker.answer(1, [{ ...candidate, score: NaN }]);
  await assert.rejects(b, /Invalid retrieval candidates/);
  assert.equal(one.worker.terminations, 1);
});
test('send failure settles requests; rejected query can otherwise leave a healthy worker usable', async (t) => {
  const one = setup(t);
  one.worker.ready();
  const a = one.client.search(canonical.text);
  await tick();
  one.worker.emit('message', { id: 0, error: 'private data' });
  await assert.rejects(a, { message: 'Canonical retrieval search failed' });
  const b = one.client.search(canonical.text);
  await tick();
  one.worker.answer(1);
  assert.deepEqual(await b, [candidate]);
  const two = setup(t);
  two.worker.ready();
  two.worker.postMessage = () => {
    throw new Error('failed');
  };
  await assert.rejects(two.client.search(canonical.text), /could not be sent/);
});
