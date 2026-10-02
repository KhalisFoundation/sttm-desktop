const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { RetrievalClient } = require('../../www/main/addons/voice-follow/engine/retrieval/client');
const {
  registerRetrievalService,
  CHANNEL,
} = require('../../www/main/addons/voice-follow/engine/retrieval/main-service');
const {
  createRendererRetrieval,
} = require('../../www/main/addons/voice-follow/engine/retrieval/renderer-client');
const { rows } = require('./fixtures/canonical-verified.json');
const row = rows[0];
const candidate = { shabadId: row.shabadId, verseId: row.verseId, score: 1 };
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
    return Promise.resolve(1);
  }
  ready() {
    this.emit('message', { ready: true, rows: 3 });
  }
  answer(id) {
    this.emit('message', { id, candidates: [candidate] });
  }
}
function setup(t) {
  const handlers = new Map(),
    workers = [],
    renderers = [];
  const sender = new EventEmitter();
  sender.id = 1;
  sender.mainFrame = {};
  const ipcMain = {
    handle: (name, fn) => handlers.set(name, fn),
    removeHandler: (name) => handlers.delete(name),
  };
  const service = registerRetrievalService({
    ipcMain,
    userData: '/never-used-in-mock',
    isAllowed: (caller) => caller === sender,
    createClient: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return new RetrievalClient('/never-used-in-mock', { workerFactory: () => worker });
    },
  });
  const invoke = (message, event = { sender, senderFrame: sender.mainFrame }) =>
    Promise.resolve().then(() => handlers.get(CHANNEL)(event, message));
  const create = () => {
    const renderer = createRendererRetrieval({ invoke: (_channel, message) => invoke(message) });
    renderers.push(renderer);
    return renderer;
  };
  t.after(async () => {
    await Promise.all(renderers.map((renderer) => renderer.dispose()));
    await service.dispose();
  });
  return { create, workers, invoke, sender, service, handlers };
}
test('real transport/service pair preserves responses and isolates an aborted microphone session', async (t) => {
  const { create, workers } = setup(t);
  const renderer = create();
  await tick();
  workers[0].ready();
  await renderer.ready;
  const controller = new AbortController();
  const old = renderer.search(row.text, 2, { signal: controller.signal });
  await tick();
  controller.abort();
  await assert.rejects(old, { name: 'AbortError' });
  const current = renderer.search(row.text, 2);
  await tick();
  workers[0].answer(0);
  await tick();
  assert.equal(renderer.pending.size, 1);
  workers[0].answer(1);
  assert.deepEqual(await current, [candidate]);
  assert.equal(await renderer.dispose(), 1);
  assert.equal(workers[0].terminations, 1);
});
test('replacement while preparing rejects old readiness and a late old close cannot kill the replacement', async (t) => {
  const { create, workers } = setup(t);
  const old = create();
  const rejected = assert.rejects(old.ready, /failed/);
  await tick();
  const current = create();
  await tick();
  workers[1].ready();
  await current.ready;
  await rejected;
  await old.dispose();
  assert.equal(workers[1].terminations, 0);
  const query = current.search(row.text);
  await tick();
  workers[1].answer(0);
  assert.deepEqual(await query, [candidate]);
  assert.equal(workers[0].terminations, 1);
});
test('only the allowed presenter main frame can create or query a worker', async (t) => {
  const { invoke, sender, workers } = setup(t);
  await assert.rejects(
    invoke({ operation: 'open', token: 'a' }, { sender: { id: 2 }, senderFrame: {} }),
    /not allowed/,
  );
  await assert.rejects(
    invoke({ operation: 'open', token: 'b' }, { sender, senderFrame: {} }),
    /not allowed/,
  );
  assert.equal(workers.length, 0);
  await assert.rejects(invoke({ operation: 'open', token: '' }), /Invalid/);
});
test('a mismatched session token cannot search or close the active owner', async (t) => {
  const { create, invoke, workers } = setup(t);
  const renderer = create();
  await tick();
  workers[0].ready();
  await renderer.ready;
  await assert.rejects(
    invoke({ operation: 'search', token: 'unrelated', text: row.text, cap: 2 }),
    /unavailable/,
  );
  await invoke({ operation: 'close', token: 'unrelated' });
  assert.equal(workers[0].terminations, 0);
});
for (const event of ['destroyed', 'render-process-gone', 'navigation']) {
  test(`presenter ${event} terminates owned worker and releases pending searches`, async (t) => {
    const { create, workers, sender } = setup(t);
    const renderer = create();
    await tick();
    workers[0].ready();
    await renderer.ready;
    const pending = assert.rejects(renderer.search(row.text), /failed/);
    await tick();
    if (event === 'navigation')
      sender.emit('did-start-navigation', {}, 'file:///new-page', false, true);
    else sender.emit(event);
    await pending;
    assert.equal(workers[0].terminations, 1);
    assert.equal(sender.listenerCount('destroyed'), 0);
    assert.equal(sender.listenerCount('render-process-gone'), 0);
    assert.equal(sender.listenerCount('did-start-navigation'), 0);
  });
}
test('same-page and subframe navigation preserve the active retrieval session', async (t) => {
  const { create, workers, sender } = setup(t);
  const renderer = create();
  await tick();
  workers[0].ready();
  await renderer.ready;
  sender.emit('did-start-navigation', {}, 'file:///page#section', true, true);
  sender.emit('did-start-navigation', {}, 'file:///subframe', false, false);
  assert.equal(workers[0].terminations, 0);
});
test('native worker exit propagates through IPC and closes every caller', async (t) => {
  const { create, workers } = setup(t);
  const renderer = create();
  await tick();
  workers[0].ready();
  await renderer.ready;
  const a = assert.rejects(renderer.search(row.text), /failed/);
  const b = assert.rejects(renderer.search(row.text), /failed/);
  await tick();
  workers[0].emit('exit', 1);
  await a;
  await b;
  assert.equal(renderer.pending.size, 0);
});
test('worker preparation failure is reported without exposing native error content', async (t) => {
  const { create, workers } = setup(t);
  const renderer = create();
  await tick();
  workers[0].emit('message', { error: 'private payload' });
  await assert.rejects(renderer.ready, { message: 'Canonical retrieval worker failed' });
  assert.equal(workers[0].terminations, 1);
});
