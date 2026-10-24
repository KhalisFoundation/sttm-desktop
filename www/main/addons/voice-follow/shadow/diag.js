// One line per event into <userData>/voice-follow/shadow/errors.log, which uploads with the
// tester's data. For machines we cannot see: what the search, the database download and the
// renderer actually reported, instead of a spinner. Never throws.
const fs = require('fs');
const os = require('os');
const path = require('path');

// Never log a computer's account name: home folders become ~ (macOS, Windows, Linux).
const scrub = (line) => {
  let out = String(line);
  try {
    const home = os.homedir();
    if (home) out = out.split(home).join('~');
  } catch (_) {
    /* ignore */
  }
  return out
    .replace(/\/Users\/[^/\s'"]+/g, '~')
    .replace(/[A-Za-z]:\\Users\\[^\\'"\n]+/g, '~')
    .replace(/\/home\/[^/\s'"]+/g, '~');
};

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
      `${new Date().toISOString()} ${scrub(line)}\n`,
    );
  } catch (_) {
    /* ignore */
  }
};

const errText = (e) => (e && (e.stack || e.message)) || String(e);

module.exports = { diag, errText, shadowDir, scrub };
