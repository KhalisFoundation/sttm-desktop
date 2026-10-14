const { EventEmitter } = require('events');
const { randomUUID } = require('crypto');
const { RetrievalClient } = require('./client');

const CHANNEL = 'voice-follow:canonical-retrieval';

// Electron 26 cannot construct Node workers in a renderer. The main service
// owns the worker; this adapter retains cancellation/queue/deadline semantics
// locally. Late IPC results cannot leak into a replacement client/session.
class MainProcessWorker extends EventEmitter {
  constructor(ipcRenderer) {
    super();
    this.ipc = ipcRenderer;
    this.token = randomUUID();
    this.closed = false;
    this.ipc.invoke(CHANNEL, { operation: 'open', token: this.token }).then(
      (ready) => {
        if (this.closed) return;
        if (!ready || ready.closed || !Number.isInteger(ready.rows)) {
          this.emit('error', new Error('Canonical retrieval preparation failed'));
          return;
        }
        this.emit('message', { ready: true, rows: ready.rows });
      },
      () => {
        if (!this.closed) this.emit('error', new Error('Canonical retrieval preparation failed'));
      },
    );
  }

  postMessage({ id, text, cap }) {
    if (this.closed) throw new Error('Canonical retrieval transport is closed');
    this.ipc.invoke(CHANNEL, { operation: 'search', token: this.token, text, cap }).then(
      (candidates) => {
        if (!this.closed) this.emit('message', { id, candidates });
      },
      () => {
        if (!this.closed) this.emit('error', new Error('Canonical retrieval search failed'));
      },
    );
  }

  terminate() {
    if (!this.termination) {
      this.closed = true;
      this.termination = this.ipc
        .invoke(CHANNEL, { operation: 'close', token: this.token })
        .then((code) => {
          this.emit('exit', code);
          return code;
        });
    }
    return this.termination;
  }
}

function createRendererRetrieval(ipcRenderer, options = {}) {
  return new RetrievalClient(null, {
    ...options,
    workerFactory: () => new MainProcessWorker(ipcRenderer),
  });
}

module.exports = { createRendererRetrieval };
