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

module.exports = { diag, errText, shadowDir };
