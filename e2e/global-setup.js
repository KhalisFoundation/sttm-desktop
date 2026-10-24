// Runs once before the tests: finds the Realm database the app needs and
// records what the app would otherwise download, so every launch can start
// with the database in place and no download in the background.
//
// The result is written to e2e/.cache/database.json and read by
// support/launch-app.js (synchronously, at every launch).
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP_NAME = 'SikhiToTheMax';
const DB_FILE = 'sttmdesktop-evergreen-v2.realm';
const SCHEMA_FILE = 'realm-schema-evergreen.json';
const DB_HASH_URL = 'https://banidb.blob.core.windows.net/database/sttmdesktop-evergreen-v2.md5';
const AI_HASH_URL = 'https://banidb.blob.core.windows.net/database/ai-translations.md5';

const cacheDir = path.join(__dirname, '.cache');
const outFile = path.join(cacheDir, 'database.json');

/** Where the installed app keeps its database on this platform. */
function installedDataDir() {
  switch (process.platform) {
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', APP_NAME);
    case 'win32':
      return path.join(
        process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
        APP_NAME,
      );
    default:
      return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), APP_NAME);
  }
}

function findDatabase() {
  const candidates = [process.env.STTM_E2E_REALM_DIR, installedDataDir(), cacheDir].filter(Boolean);
  const dir = candidates.find(
    (candidate) =>
      fs.existsSync(path.join(candidate, DB_FILE)) &&
      fs.statSync(path.join(candidate, DB_FILE)).size > 0 &&
      fs.existsSync(path.join(candidate, SCHEMA_FILE)),
  );
  if (!dir) {
    throw new Error(
      `No Realm database found (${DB_FILE} + ${SCHEMA_FILE}). Looked in:\n  ${candidates.join(
        '\n  ',
      )}\nRun \`node e2e/scripts/fetch-realm.mjs\` or set STTM_E2E_REALM_DIR.`,
    );
  }
  return { realm: path.join(dir, DB_FILE), schema: path.join(dir, SCHEMA_FILE) };
}

/** The md5 file's body, exactly as the app stores it; '' when it can't be fetched. */
async function hashText(url) {
  try {
    const response = await fetch(url);
    return response.ok ? await response.text() : '';
  } catch {
    return '';
  }
}

module.exports = async function globalSetup() {
  const database = findDatabase();
  const previous = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
  // The hashes change only when a new database is published; reuse the last
  // ones when offline. A missing hash just means the app checks for itself.
  const dbHash = (await hashText(DB_HASH_URL)) || previous.dbHash || '';
  const aiHash = (await hashText(AI_HASH_URL)) || previous.aiHash || '';
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ ...database, dbHash, aiHash }, null, 2));
};
