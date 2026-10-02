const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_FILENAME = 'ai-translations.db';

// Translation `type` values stored in the `ai_translations` table. These double
// as the `translation-english-source` keys in configs/user-settings.json.
const TYPES = {
  PSS: 'pss',
  PSS_SIMPLE: 'pss_simple',
};

const TYPE_VALUES = Object.values(TYPES);

/**
 * Whether a translation source is served by this database rather than by the
 * translations bundled with each verse.
 *
 * @param {string} source A `translation-english-source` key
 * @returns {boolean}
 */
const isAiSource = (source) => TYPE_VALUES.includes(source);

let db = null;
let statement = null;
let dbUnavailable = false;

// Cache of `${type}:${verseId}` -> string|null, so repeated renders of the same
// verse don't re-query the database.
const cache = new Map();

/**
 * Resolve the path to the translations database.
 *
 * In the packaged app the file is shipped via `extraResources` so that it lives
 * outside of app.asar – sqlite needs a real file on disk. In dev it is read
 * straight out of www/assets.
 *
 * @returns {string|null} Absolute path to the db file, or null if not found
 */
const resolveDbPath = () => {
  const candidates = [
    path.join(process.resourcesPath || '', 'assets', DB_FILENAME),
    path.resolve(__dirname, '../../assets', DB_FILENAME),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
};

/**
 * Open the translations database. Called lazily on first lookup; the handle and
 * prepared statement are reused afterwards.
 *
 * The database is optional – if the file is missing or unreadable, lookups
 * simply return null and the app falls back to the bundled translations.
 *
 * @returns {object|null} A prepared lookup statement, or null if unavailable
 */
const getStatement = () => {
  if (statement || dbUnavailable) {
    return statement;
  }

  try {
    const dbPath = resolveDbPath();
    if (!dbPath) {
      throw new Error(`${DB_FILENAME} not found in assets`);
    }

    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    statement = db.prepare(
      'SELECT translation_text AS text FROM ai_translations WHERE verse_id = ? AND type = ?',
    );
  } catch (err) {
    dbUnavailable = true;
    statement = null;
    /* eslint-disable-next-line no-console */
    console.error('Failed to open AI translations database:', err.message);
  }

  return statement;
};

/**
 * Get an AI translation for a specific verse.
 *
 * @param {number} verseId The verse ID to look up
 * @param {string} type The translation type, e.g. 'pss' or 'pss_simple'
 * @returns {string|null} The translation text, or null if not found
 */
const getTranslation = (verseId, type = TYPES.PSS) => {
  const cacheKey = `${type}:${verseId}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  let text = null;
  const lookup = getStatement();

  if (lookup) {
    try {
      const row = lookup.get(verseId, type);
      text = (row && row.text) || null;
    } catch (err) {
      /* eslint-disable-next-line no-console */
      console.error('AI translation lookup failed:', err.message);
    }
  }

  cache.set(cacheKey, text);
  return text;
};

module.exports = {
  TYPES,
  isAiSource,
  getTranslation,
};
