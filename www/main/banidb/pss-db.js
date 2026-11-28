const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');
const remote = require('@electron/remote');
const Database = require('better-sqlite3');

const { store } = remote.require('./app');

const userDataPath = remote.app.getPath('userData');

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
 * The file is downloaded into userData next to the realm database (see
 * downloadAiTranslationsDB in desktop_scripts.js). Each version gets its own
 * file name, stored as `aiTranslationsFile`, so an update never has to replace
 * a file another window still has open.
 *
 * @returns {string|null} Absolute path to the db file, or null if not downloaded yet
 */
const resolveDbPath = () => {
  const fileName = store.get('aiTranslationsFile');
  if (!fileName) {
    return null;
  }

  const dbPath = path.resolve(userDataPath, fileName);
  return fs.existsSync(dbPath) ? dbPath : null;
};

/**
 * Drop the open handle and cached lookups, so the next lookup opens whichever
 * database is current. Runs when a new version has been downloaded.
 */
const reset = () => {
  if (db) {
    try {
      db.close();
    } catch (err) {
      /* eslint-disable-next-line no-console */
      console.error('Failed to close AI translations database:', err.message);
    }
  }
  db = null;
  statement = null;
  dbUnavailable = false;
  cache.clear();
};

// Bumped on every new download, so views can re-render the verse on screen
// instead of waiting for the next one.
let version = 0;
const listeners = new Set();

const getVersion = () => version;

/**
 * Subscribe to new downloads of the database.
 *
 * @param {function(number)} listener Called with the new version
 * @returns {function} Unsubscribe
 */
const onUpdate = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

ipcRenderer.on('ai-translations-updated', () => {
  reset();
  version += 1;
  listeners.forEach((listener) => listener(version));
});

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
      throw new Error('AI translations database has not been downloaded yet');
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

// Shown in place of an AI source for verses it has no translation for, or while
// the database hasn't been downloaded yet.
const FALLBACK_SOURCE = 'bdb';

/**
 * Parse a verse's translations and, when the selected English source is served
 * by this database, put that source's text under its own key (e.g.
 * translations.en.pss_simple) so it can be read like any other source. If the
 * verse has no AI translation, the BaniDB one is put there instead.
 *
 * @param {object} verseObj A verse with `ID` and the `Translations` JSON string
 * @param {string} source A `translation-english-source` key
 * @returns {{translations: object, shownSource: string}} The translations, and
 *   the source whose English text is actually shown
 */
const getTranslationsWithAiSource = (verseObj, source) => {
  const translations = JSON.parse(verseObj.Translations);
  if (!isAiSource(source)) {
    return { translations, shownSource: source };
  }

  if (!translations.en) {
    translations.en = {};
  }

  const translationText = getTranslation(verseObj.ID, source);
  if (translationText) {
    translations.en[source] = translationText;
    return { translations, shownSource: source };
  }

  const fallbackText = translations.en[FALLBACK_SOURCE];
  if (fallbackText) {
    translations.en[source] = fallbackText;
    return { translations, shownSource: FALLBACK_SOURCE };
  }

  return { translations, shownSource: source };
};

module.exports = {
  TYPES,
  isAiSource,
  getTranslation,
  getTranslationsWithAiSource,
  getVersion,
  onUpdate,
};
