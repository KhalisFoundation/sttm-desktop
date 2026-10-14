const { parentPort: threadPort, workerData } = require('worker_threads');
const { readCorpus } = require('./read-corpus');
const { TextIndex } = require('./text-index');

// Keep the same search implementation for Node diagnostics and the isolated
// Electron utility process. Electron delivers parent messages as { data }.
const parentPort = threadPort || {
  on: (name, listener) => process.parentPort.on(name, (event) => listener(event.data)),
  postMessage: (message) => process.parentPort.postMessage(message),
  close: () => process.exit(0),
};

async function start() {
  const rows = await readCorpus(workerData ? workerData.userData : process.argv[2]);
  const index = new TextIndex(rows);
  parentPort.on('message', (message) => {
    const { id, text, cap } = message || {};
    if (
      !Number.isSafeInteger(id) ||
      typeof text !== 'string' ||
      !Number.isInteger(cap) ||
      cap < 1 ||
      cap > 100
    ) {
      parentPort.postMessage({ id, error: 'Invalid retrieval request' });
      return;
    }
    try {
      parentPort.postMessage({ id, candidates: index.search(text, cap) });
    } catch (_) {
      parentPort.postMessage({ id, error: 'Retrieval search failed' });
    }
  });
  parentPort.postMessage({ ready: true, rows: rows.length });
}
start().catch(() => {
  // Native/database errors can contain paths or query data. Report a stable
  // failure; callers must never substitute unverified text into the display.
  parentPort.postMessage({ error: 'Canonical retrieval preparation failed' });
  parentPort.close();
});
