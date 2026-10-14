const { Worker } = require('worker_threads');
const path = require('path');

function aborted() {
  const error = new Error('Retrieval request cancelled');
  error.name = 'AbortError';
  return error;
}

// One owner per mounted Voice Follow instance. Searches can be aborted per
// microphone session; disposal releases the worker and settles every waiter.
class RetrievalClient {
  constructor(
    userData,
    {
      workerFactory = (file, options) => new Worker(file, options),
      startupTimeoutMs = 45000,
      queryTimeoutMs = 5000,
      maxPending = 4,
    } = {},
  ) {
    this.pending = new Map();
    this.nextId = 0;
    this.state = 'starting';
    this.queryTimeoutMs = queryTimeoutMs;
    this.maxPending = maxPending;
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    // Preparation can fail before a first query. Keep that rejection observable
    // to callers without creating an unhandled rejection in the meantime.
    this.ready.catch(() => {});
    this.startupTimer = setTimeout(() => {
      this.fail(new Error('Canonical retrieval preparation timed out'));
    }, startupTimeoutMs);
    try {
      this.worker = workerFactory(path.join(__dirname, 'worker.js'), { workerData: { userData } });
      this.worker.on('message', (message) => this.receive(message));
      this.worker.on('error', () => this.fail(new Error('Canonical retrieval worker failed')));
      this.worker.on('exit', () => this.fail(new Error('Canonical retrieval worker exited')));
    } catch (_) {
      this.fail(new Error('Canonical retrieval worker could not start'));
    }
  }

  finish(id, error, candidates) {
    const request = this.pending.get(id);
    if (!request) return;
    this.pending.delete(id);
    clearTimeout(request.timer);
    if (request.signal) request.signal.removeEventListener('abort', request.onAbort);
    if (error) request.reject(error);
    else request.resolve(candidates);
  }

  terminate() {
    if (!this.termination) {
      try {
        this.termination = Promise.resolve(this.worker ? this.worker.terminate() : undefined);
      } catch (error) {
        this.termination = Promise.reject(error);
      }
      this.termination.catch(() => {});
    }
    return this.termination;
  }

  fail(error) {
    if (this.state === 'closed' || this.state === 'failed') return;
    this.state = 'failed';
    this.failure = error;
    clearTimeout(this.startupTimer);
    this.rejectReady(error);
    this.pending.forEach((_, id) => this.finish(id, error));
    this.terminate();
  }

  receive(message) {
    if (this.state === 'closed' || this.state === 'failed') return;
    if (!message || typeof message !== 'object') {
      this.fail(new Error('Invalid retrieval worker response'));
      return;
    }
    if (message.ready === true && this.state === 'starting') {
      if (!Number.isInteger(message.rows) || message.rows <= 0) {
        this.fail(new Error('Canonical retrieval corpus is empty'));
        return;
      }
      this.state = 'ready';
      clearTimeout(this.startupTimer);
      this.resolveReady({ rows: message.rows });
      return;
    }
    if (message.id == null && message.error) {
      this.fail(new Error('Canonical retrieval preparation failed'));
      return;
    }
    const request = this.pending.get(message.id);
    if (!request) return; // A cancelled request may still finish in the worker.
    if (message.error) {
      this.finish(message.id, new Error('Canonical retrieval search failed'));
      return;
    }
    const { candidates } = message;
    if (
      !Array.isArray(candidates) ||
      candidates.length > request.cap ||
      candidates.some(
        (row) =>
          !row ||
          !Number.isSafeInteger(row.shabadId) ||
          !Number.isSafeInteger(row.verseId) ||
          !Number.isFinite(row.score),
      )
    ) {
      this.fail(new Error('Invalid retrieval candidates'));
      return;
    }
    // Whitelist protocol fields: even a faulty response cannot turn an acoustic
    // hypothesis or internal normalized key into displayed canonical text.
    this.finish(
      message.id,
      null,
      candidates.map(({ shabadId, verseId, score }) => ({
        shabadId,
        verseId,
        score,
      })),
    );
  }

  search(text, cap = 60, { signal } = {}) {
    if (typeof text !== 'string' || !Number.isInteger(cap) || cap < 1 || cap > 100) {
      return Promise.reject(new Error('Invalid retrieval request'));
    }
    if (signal && signal.aborted) return Promise.reject(aborted());
    if (this.state === 'closed' || this.state === 'failed') {
      return Promise.reject(this.failure || new Error('Canonical retrieval is closed'));
    }
    if (this.pending.size >= this.maxPending) {
      return Promise.reject(new Error('Canonical retrieval queue is full'));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const request = { resolve, reject, cap, signal, onAbort: () => this.finish(id, aborted()) };
      this.pending.set(id, request);
      if (signal) signal.addEventListener('abort', request.onAbort, { once: true });
      this.ready.then(
        () => {
          if (!this.pending.has(id)) return;
          request.timer = setTimeout(() => {
            // A hung worker is unusable for subsequent decodes. Fail all waiters
            // and release it instead of building an unbounded backlog.
            this.fail(new Error('Canonical retrieval search timed out'));
          }, this.queryTimeoutMs);
          try {
            this.worker.postMessage({ id, text, cap });
          } catch (_) {
            this.fail(new Error('Canonical retrieval request could not be sent'));
          }
        },
        (error) => this.finish(id, error),
      );
    });
  }

  dispose() {
    if (this.state !== 'closed') {
      this.state = 'closed';
      this.failure = new Error('Canonical retrieval is closed');
      clearTimeout(this.startupTimer);
      this.rejectReady(this.failure);
      this.pending.forEach((_, id) => this.finish(id, this.failure));
    }
    return this.terminate();
  }
}

module.exports = { RetrievalClient };
