const { ipcRenderer } = require('electron');

// Translation `type` values stored in the `ai_translations` table. These double
// as the `translation-english-source` keys in configs/user-settings.json.
const TYPES = {
  PSS: 'pss',
  PSS_SIMPLE: 'pss_simple',
};

const TYPE_VALUES = Object.values(TYPES);

/**
 * Whether a translation source is served by the AI translations database
 * rather than by the translations bundled with each verse.
 *
 * @param {string} source A `translation-english-source` key
 * @returns {boolean}
 */
const isAiSource = (source) => TYPE_VALUES.includes(source);

// Cache of `${type}:${verseId}` -> string|null, so repeated renders of the same
// verse don't round-trip to the main process.
const cache = new Map();

// A new database version was downloaded; drop cached lookups so the next
// lookup reads from the new file (the main process reopens it).
ipcRenderer.on('ai-translations-updated', () => cache.clear());

/**
 * Get an AI translation for a specific verse.
 *
 * The SQLite database is opened only in the main process (see
 * `get-ai-translation` in app.js): the better-sqlite3 native addon crashes
 * Chromium renderer processes, which is where the viewer runs. The lookup is a
 * synchronous IPC call so the text is available during render.
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
  try {
    text = ipcRenderer.sendSync('get-ai-translation', verseId, type) || null;
  } catch (err) {
    /* eslint-disable-next-line no-console */
    console.error('AI translation lookup failed:', err.message);
  }

  cache.set(cacheKey, text);
  return text;
};

module.exports = {
  TYPES,
  isAiSource,
  getTranslation,
};
