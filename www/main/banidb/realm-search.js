/* eslint-disable import/no-dynamic-require, global-require */
const electron = require('electron');
const path = require('path');
const Realm = require('realm');

const CONSTS = require('./constants');

let userDataPath;

if (electron.app) {
  userDataPath = electron.app.getPath('userData');
} else {
  const { app } = require('@electron/remote');
  userDataPath = app.getPath('userData');
}

const realmPath = path.resolve(userDataPath, 'sttmdesktop-evergreen-v2.realm');
const realmSchemaPath = path.resolve(userDataPath, 'realm-schema-evergreen.json');

// TODO: Investigate possible memory issues from multiple Realm.open calls
// https://github.com/KhalisFoundation/sttm-desktop/pull/517#discussion_r261644205
const realmConfig = {
  path: realmPath,
  readOnly: true,
};

let initialized = false;

// Every query opens the database read-only and closes it again. On Windows two such opens
// at the same moment (several at startup) can fail with "Failed to open: The system cannot
// find the file specified. (0x2)" while the other open still holds the lock file. One short
// retry covers it; the cause is recorded for machines we cannot see.
const openRealm = () =>
  Realm.open(realmConfig).catch((e) => {
    try {
      // eslint-disable-next-line global-require
      require('../addons/voice-follow/shadow/diag').diag(
        `realm open retried: ${(e && e.message) || e}`,
      );
    } catch (_) {
      /* diagnostics only */
    }
    return new Promise((resolve) => {
      setTimeout(resolve, 300);
    }).then(() => Realm.open(realmConfig));
  });

const init = () => {
  try {
    const realmSchema = require(realmSchemaPath);
    realmConfig.schema = realmSchema.schemas;
    realmConfig.schemaVersion = realmSchema.schemaVersion;
    initialized = true;
  } catch (e) {
    initialized = false;
  }
};

const hasBindiCharacter = (charCode) => CONSTS.BINDI_CHARS[charCode] || false;

/**
 * Retrieve lines matching queries
 *
 * @param {string} searchQuery The string for which to search
 * @param {number} searchType The type of search to execute
 * @param {string} searchSource The one-letter SourceID (or 'all')
 * @returns {array} Returns array of objects for each line
 * @example
 *
 * search('jggsspp', 0, 'all');
 * // => [{ Gurmukhi: 'jo gurisK guru syvdy sy puMn prwxI ]', ID: 31057 },...]
 */
const query = (searchQuery, searchType, searchSource, resultRows = 20) =>
  new Promise((resolve, reject) => {
    if (!initialized) {
      init();
    }
    let dbQuery = '';
    let searchCol = '';
    let condition = '';
    // Sanitize query
    const saniQuery = searchQuery.trim().replace("'", "\\'");
    // default source for ang search to GURU_GRANTH_SAHIB
    let angSearchSourceId = CONSTS.SOURCE_TYPES.GURU_GRANTH_SAHIB;
    const order = [];
    let howManyRows = resultRows;
    switch (searchType) {
      case CONSTS.SEARCH_TYPES.FIRST_LETTERS: // First letter start
      case CONSTS.SEARCH_TYPES.FIRST_LETTERS_ANYWHERE: {
        // First letter anywhere
        searchCol = 'FirstLetterStr';
        let operator = searchType === CONSTS.SEARCH_TYPES.FIRST_LETTERS ? 'BEGINSWITH' : 'CONTAINS';
        let isWildChar = false;
        for (let x = 0, len = saniQuery.length; x < len; x += 1) {
          let charCode = saniQuery.charCodeAt(x);
          if (charCode < 100) {
            charCode = `0${charCode}`;
          }
          if (charCode === '042') {
            isWildChar = true;
            dbQuery += ',*';
            operator = 'LIKE';
          } else {
            dbQuery += `,${charCode}`;
          }
        }

        let replaced = '';
        let newQuery = '';
        const dbQueryArray = dbQuery.split(',');
        dbQueryArray.forEach((charCode) => {
          const bindiCharCode = hasBindiCharacter(charCode);
          if (bindiCharCode) {
            newQuery = dbQuery.replaceAll(charCode, bindiCharCode);
          }
        });
        if (newQuery) {
          replaced = `OR ${searchCol} ${operator} '${newQuery}'`;
        }

        if (isWildChar) {
          dbQuery =
            searchType === CONSTS.SEARCH_TYPES.FIRST_LETTERS ? `${dbQuery}*` : `*${dbQuery}*`;
        }
        condition = `${searchCol} ${operator} '${dbQuery}' ${replaced}`;
        if (saniQuery.length < 3) {
          order.push('FirstLetterLen');
        }
        if (searchSource !== 'all') {
          condition += ` AND Source.SourceID = '${searchSource}'`;
        }
        break;
      }
      case CONSTS.SEARCH_TYPES.GURMUKHI_WORD: // Full word (Gurmukhi)
      case CONSTS.SEARCH_TYPES.ENGLISH_WORD: {
        // Full word (English)
        let caseInsensitive = false;
        if (searchType === 2) {
          searchCol = 'Gurmukhi';
        } else {
          searchCol = 'Translations';
          caseInsensitive = true;
        }
        const words = saniQuery
          .split(' ')
          .map(
            (word) =>
              `(${searchCol} CONTAINS${
                caseInsensitive ? '[c]' : ''
              } ' ${word}' OR ${searchCol} BEGINSWITH${caseInsensitive ? '[c]' : ''} '${word}')`,
          );
        condition = words.join(' AND ');
        if (searchSource !== 'all') {
          condition += ` AND Source.SourceID = '${searchSource}'`;
        }
        break;
      }
      case CONSTS.SEARCH_TYPES.ANG: // Ang
        searchCol = 'PageNo';
        howManyRows = 1000;
        dbQuery = parseInt(saniQuery, 10);
        // condition = `${searchCol} = ${dbQuery}`;
        // The above line is commented because to check if we can resolve mentioned deep scan issue (Value assigned to variable 'condition' at this point is not used before it is overwritten)

        switch (global.core.search.currentMeta.source) {
          case null:
            break;
          default:
            angSearchSourceId = global.core.search.currentMeta.source;
            break;
        }
        condition = `${searchCol} = ${dbQuery} AND Source.SourceID = '${angSearchSourceId}'`;
        break;
      case CONSTS.SEARCH_TYPES.MAIN_LETTERS:
        searchCol = 'MainLetters';

        saniQuery.split(' ').forEach((word, index) => {
          condition +=
            index === 0
              ? `${searchCol} CONTAINS '${word}'`
              : ` AND ${searchCol} CONTAINS '${word}'`;
        });

        if (searchSource !== 'all') {
          condition += ` AND Source.SourceID = '${searchSource}'`;
        }

        break;
      case CONSTS.SEARCH_TYPES.FIRST_LETTERS_ENGLISH:
        searchCol = 'FirstLetterEng';
        // Each `*` stands for at least one letter, as in the Gurmukhi first-letter
        // search (LIKE's `?` is one letter, `*` any more); CONTAINS would look
        // for a literal `*`.
        condition = saniQuery.includes('*')
          ? `${searchCol} LIKE[c] '*${saniQuery.replace(/\*/g, '?*')}*'`
          : `${searchCol} CONTAINS[c] '${saniQuery}'`;
        if (searchSource !== 'all') {
          condition += ` AND Source.SourceID = '${searchSource}'`;
        }
        break;
      default:
        break;
    }
    const orderArray = Array.from(order, (el) => [el, false]);
    openRealm()
      .then((realm) => {
        const rows = realm.objects('Verse').filtered(condition).sorted(orderArray);
        resolve(rows.slice(0, howManyRows));
      })
      .catch((e) => {
        /* eslint-disable-next-line no-console */
        console.log(e);
        reject();
      });
  });

/**
 * Retrieve all lines from a Shabad
 *
 * @param {number} ShabadID The specific Shabad to get
 * @returns {object} Returns array of objects for each line
 * @example
 *
 * loadShabad(2776);
 * // => [{ Gurmukhi: 'jo gurisK guru syvdy sy puMn prwxI ]', ID: 31057 },...]
 */
/**
 * One full scan of every Verse's first-letter encoding, for the Voice-Follow
 * autopilot acoustic backstop (a cheap whole-field screen before text
 * rescoring). Returns [{ shabadId, verseId, fl }] in verse-ID order, where fl
 * is the plain-ascii first-letter string decoded from FirstLetterStr — the
 * same alphabet the detector's toAsciiFirstLetters produces, so the two can
 * be compared directly with an LCS overlap. Runs once per autopilot session;
 * callers concatenate per shabad and cache the Map.
 */
const loadFirstLetterIndex = () =>
  new Promise((resolve, reject) => {
    if (!initialized) {
      init();
    }
    openRealm()
      .then((realm) => {
        const out = [];
        const rows = realm.objects('Verse').sorted('ID');
        for (let i = 0; i < rows.length; i += 1) {
          try {
            const r = rows[i];
            const sh = r.Shabads && r.Shabads[0] ? r.Shabads[0].ShabadID : null;
            if (sh == null || !r.FirstLetterStr) continue; // eslint-disable-line no-continue
            const fl = String(r.FirstLetterStr)
              .split(',')
              .filter((c) => c !== '')
              .map((c) => String.fromCharCode(parseInt(c, 10)))
              .join('');
            if (fl) out.push({ shabadId: sh, verseId: r.ID, fl });
          } catch (_) {
            /* skip malformed rows; the screen degrades, nothing breaks */
          }
        }
        resolve(out);
      })
      .catch(reject);
  });

const loadShabad = (ShabadID) =>
  new Promise((resolve, reject) => {
    if (!initialized) {
      init();
    }
    openRealm()
      .then((realm) => {
        const rows = realm
          .objects('Verse')
          .filtered('ANY Shabads.ShabadID == $0', ShabadID)
          .sorted('ID');
        if (rows.length > 0) {
          resolve(rows);
        }
      })
      .catch(reject);
  });

/**
 * Retrieve all lines from a Bani
 *
 * @param {number} BaniID The specific Bani to get
 * @returns {object} Returns array of objects for each line
 * @example
 *
 * loadBani(2, "extralong");
 * // => [{ Bani: { Gurmukhi: 'jpujI swihb', ID: 2,...},...}]
 */
const loadBani = (BaniID, BaniLength) =>
  new Promise((resolve, reject) => {
    if (!initialized) {
      init();
    }
    openRealm()
      .then((realm) => {
        const condition = `Bani.ID == ${BaniID} AND ${BaniLength} == true`;
        // Always answer, even with no rows: a Bani with nothing at this length
        // used to leave the promise pending forever, silently stalling callers.
        resolve(realm.objects('Banis_Shabad').filtered(condition).sorted('Seq'));
      })
      .catch(reject);
  });

/**
 * Index of every Bani's shabads, in recitation order, for one Bani length.
 * Voice-Follow uses it to recognise a Bani being recited (two of its shabads
 * heard in order) and follow the whole Bani instead of shabad by shabad.
 *
 * @param {string} BaniLength The length column, e.g. "existsSGPC"
 * @returns {object} { [baniId]: [shabadId, ...] } distinct shabads in Seq order
 * @example
 *
 * loadBaniIndex("existsSGPC");
 * // => { 21: [2046, 2047, ...], 23: [...], ... }
 */
const loadBaniIndex = (BaniLength) =>
  new Promise((resolve, reject) => {
    if (!initialized) {
      init();
    }
    openRealm()
      .then((realm) => {
        const rows = realm.objects('Banis_Shabad').filtered(`${BaniLength} == true`).sorted('Seq');
        const index = {};
        rows.forEach((row) => {
          const baniId = row.Bani && row.Bani.ID;
          const shabadId = row.Shabad && row.Shabad.ShabadID;
          if (baniId == null || shabadId == null) return;
          const list = index[baniId] || (index[baniId] = []);
          if (list[list.length - 1] !== shabadId) list.push(shabadId);
        });
        resolve(index);
      })
      .catch(reject);
  });

/**
 * Retrieve all lines from a Ceremony
 *
 * @param {number} CermonyID The specific Shabad to get
 * @returns {object} Returns array of objects for each line
 * @example
 *
 * loadCeremony(3);
 * // => [{ Ceremony: { ID: 26106, Seq:2,...},...}]
 */

const loadCeremony = (ceremonyID) =>
  new Promise((resolve, reject) => {
    if (!initialized) {
      init();
    }
    openRealm()
      .then((realm) => {
        const rows = realm
          .objects('Ceremonies_Shabad')
          .filtered('Ceremony.ID == $0', ceremonyID)
          .sorted('Seq');
        if (rows.length > 0) {
          resolve(rows);
        }
      })
      .catch(reject);
  });

/**
 * Retrieve all banis for sunder gutka
 *
 * @returns {object} Returns array of objects for each line
 * @example
 *
 * loadBanis();
 * // => [ {Gurmukhi: "gur mMqR", ID: 1, Token: "gurmantar"}, {Gurmukhi: "jpujI swihb" ...} ]
 */
const loadBanis = () =>
  new Promise((resolve, reject) => {
    if (!initialized) {
      init();
    }
    openRealm()
      .then((realm) => {
        const rows = realm.objects('Banis').filtered('ID < 10000').sorted('ID');
        if (rows.length > 0) {
          resolve(rows);
        }
      })
      .catch(reject);
  });

/**
 * Retrieve all ceremonies
 *
 * @returns {object} Returns array of objects for each ceremony
 * @example
 *
 * loadCeremonies();
 * // => [{ Gurmukhi:  "AnMd kwrj", ID: 1 ... },...]
 */

const loadCeremonies = () =>
  new Promise((resolve, reject) => {
    if (!initialized) {
      init();
    }
    openRealm()
      .then((realm) => {
        const rows = realm.objects('Ceremonies').sorted('ID');
        if (rows.length > 0) {
          resolve(rows);
        }
      })
      .catch(reject);
  });
/**
 * Retrieve the Ang number and source for any given ShabadID
 *
 * @param {number} ShabadID The ShabadID for which to search
 * @returns {object} Returns the PageNo and SourceID on which the ShabadID starts
 * @example
 *
 * getAng(2776);
 * // => { PageNo: 726, SourceID: 'G' }
 */
const getAng = (ShabadID) =>
  new Promise((resolve, reject) => {
    if (!initialized) {
      init();
    }
    openRealm()
      .then((realm) => {
        const row = realm.objects('Verse').filtered('ANY Shabads.ShabadID == $0', ShabadID)[0];
        const { PageNo, Source } = row;
        resolve({
          PageNo,
          SourceID: Source.SourceID,
        });
      })
      .catch(reject);
  });

/**
 * Retrieve all lines from a page
 *
 * @since 3.3.0
 * @param {number} PageNo Page number to get
 * @param {string} [SourceID=G] Source from which to get
 * @returns {array} Returns array of objects for each line
 * @example
 *
 * loadAng(1);
 * // => [{ Gurmukhi: 'jo gurisK guru syvdy sy puMn prwxI ]', ID: 31057 },...]
 */
const loadAng = (PageNo, SourceID = 'G') =>
  new Promise((resolve, reject) => {
    if (!initialized) {
      init();
    }
    openRealm()
      .then((realm) => {
        const rows = realm
          .objects('Verse')
          .filtered('PageNo = $0 AND Source.SourceID = $1', PageNo, SourceID);
        if (rows.length > 0) {
          resolve(rows);
        } else {
          reject();
        }
      })
      .catch(reject);
  });

/**
 * Retrieve Shabad for Verse
 *
 * @since 4.2.0
 * @param {number} VerseID Verse to search
 * @returns {number} Returns ShabadID as a Promise
 * @example
 *
 * getShabad(1);
 * // => 1
 */
const getShabad = (VerseID) =>
  new Promise((resolve, reject) => {
    if (!initialized) {
      init();
    }
    openRealm()
      .then((realm) => {
        const shabad = realm.objects('Verse').filtered('ID = $0', VerseID)[0];
        resolve(shabad.Shabads[0].ShabadID);
      })
      .catch(reject);
  });

/**
 * Retrieve a random Shabad from a source
 *
 * @since 3.3.2
 * @param {string} [SourceID=G] Source from which to get
 * @returns {integer} Returns integer for ShabadID
 * @example
 *
 * randomShabad();
 * // => 13
 */
const randomShabad = (SourceID = 'G') =>
  new Promise((resolve, reject) => {
    openRealm()
      .then((realm) => {
        const rows = realm.objects('Verse').filtered('Source.SourceID = $0', SourceID);
        const row = rows[Math.floor(Math.random() * rows.length)];
        resolve(row.Shabads[0].ShabadID);
      })
      .catch(reject);
  });

/**
 * Retrieve a particular text of a verse in a shabad
 *
 * @since 9.1.2
 * @param {number} shabadId id of the shabad containing the verse
 * @param {number} verseId id of the particular verse
 * @returns {string} Returns the text of that verse
 * @example
 *
 * getVerse(13);
 * // => hukmI auqmu nIcu hukim iliK duK suK pweIAih ]
 */
const getVerse = (shabadId, verseId) =>
  new Promise((resolve, reject) => {
    openRealm()
      .then((realm) => {
        if (verseId) {
          const rows = realm.objects('Verse').filtered('ID = $0', verseId);
          resolve(rows[0].Gurmukhi);
        } else {
          const rows = realm.objects('Verse').filtered('ANY Shabads.ShabadID == $0', shabadId);
          resolve(rows[0].Gurmukhi);
        }
      })
      .catch(reject);
  });

/**
 * Retrieve the filter options; writer, raag, and source
 *
 * @param {string} type Type of filter option to retrieve
 * @param {array} writerIds An array of ids to fetch
 * @returns {object} Returns array of objects for given type of filter option
 * @example
 *
 * getFilterOption('writer', [1,2]);
 * // => [{ Writer: { WriterID: 1, WriterEnglish:'Guru Nanak Dev Ji',...},...}]
 */

const getFilterOption = (type, idArray) =>
  new Promise((resolve, reject) => {
    if (!initialized) {
      init();
    }
    let collectionName;
    let columnName;
    switch (type) {
      case 'writer':
        collectionName = 'Writer';
        columnName = 'WriterID';
        break;
      case 'raag':
        collectionName = 'Raag';
        columnName = 'RaagID';
        break;
      case 'source':
        collectionName = 'Source';
        columnName = 'SourceID';
        break;
      default:
        resolve({ error: `Unable to find a filter option with type: ${type}` });
    }

    openRealm()
      .then((realm) => {
        const idsQuery = idArray
          .map((id) => (type === 'source' ? `${columnName} = '${id}'` : `${columnName} = ${id}`))
          .join(' OR ');
        const rows = realm.objects(collectionName).filtered(`(${idsQuery})`);
        if (rows.length > 0) {
          resolve(rows);
        }
      })
      .catch(reject);
  });

// Re-export CONSTS for use in other areas
module.exports = {
  CONSTS,
  query,
  loadShabad,
  loadFirstLetterIndex,
  loadBanis,
  loadBani,
  loadBaniIndex,
  loadCeremony,
  loadCeremonies,
  getAng,
  loadAng,
  getShabad,
  randomShabad,
  getVerse,
  getFilterOption,
};
