// One line per event into <userData>/voice-follow/shadow/errors.log, which uploads with the
// tester's data. For machines we cannot see: what the search, the database download and the
// renderer actually reported, instead of a spinner. Never throws.
const fs = require('fs');
const path = require('path');

let dir = null;
const shadowDir = () => {
  if (dir) return dir;
  // eslint-disable-next-line global-require
  const remote = require('@electron/remote');
  dir = path.join(remote.app.getPath('userData'), 'voice-follow', 'shadow');
  return dir;
};

let count = 0;
const diag = (line) => {
  try {
    count += 1;
    if (count > 500) return; // a looping failure must not fill the disk
    fs.mkdirSync(shadowDir(), { recursive: true });
    fs.appendFileSync(
      path.join(shadowDir(), 'errors.log'),
      `${new Date().toISOString()} ${line}\n`,
    );
  } catch (_) {
    /* ignore */
  }
};

const errText = (e) => (e && (e.stack || e.message)) || String(e);

// Fault wrapping. Nothing in the collector may throw into React, a timer, IPC or an audio
// callback: a bug here must never blank or crash STTM in a Gurdwara. guard() returns the
// same function with every exception (sync or a rejected promise) caught, logged once a
// minute per name at most (a looping fault must not flood errors.log) and replaced by
// `fallback`.
const FAULT_RATE_MS = 60 * 1000;
const faultAt = new Map();
const logFault = (name, e) => {
  const now = Date.now();
  if (now - (faultAt.get(name) || 0) < FAULT_RATE_MS) return;
  faultAt.set(name, now);
  diag(`fault in ${name}: ${errText(e)}`);
};
const guard = (name, fn, fallback) =>
  function guarded(...args) {
    try {
      const r = fn.apply(this, args);
      if (r && typeof r.then === 'function') {
        return r.then(undefined, (e) => {
          logFault(name, e);
          return fallback;
        });
      }
      return r;
    } catch (e) {
      logFault(name, e);
      return fallback;
    }
  };

module.exports = { diag, errText, shadowDir, guard, logFault };
