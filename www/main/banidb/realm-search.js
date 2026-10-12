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

// First-letter search follows banidb-api (api/controllers/shabads.js and
// api/lib/searchOperators.js), so the app and the website return the same
// lines for the same query.
const SEARCH_OPERATORS = ['+', '-', '*', '"', "'"];
// A run of anything but + and -, with the + or - that leads it.
// eslint-disable-next-line no-control-regex
const SEPARATE_AT_PLUS_OR_MINUS = /[+-]?[\x00-\x2A\x2C\x2E-\x7F]+/g;

// Each letter as a comma and its three-digit char code; operators stay as typed.
const toCharCodeQuery = (letters) =>
  Array.from(letters, (letter) =>
    SEARCH_OPERATORS.includes(letter) ? letter : `,${`${letter.charCodeAt(0)}`.padStart(3, '0')}`,
  ).join('');

// The same letters with every one that has a bindi form swapped for it.
const toBindiQuery = (charCodeQuery) =>
  Object.entries(CONSTS.BINDI_CHARS).reduce(
    (bindiQuery, [charCode, bindiCharCode]) => bindiQuery.replaceAll(charCode, bindiCharCode),
    charCodeQuery,
  );

/**
 * The Realm condition for a first-letter search.
 *
 * Plain letters match from the start of the line (or anywhere), in either
 * their plain or their bindi spelling. With operators, `*` stands for any
 * letters, `+` joins parts that must all be there and `-` leads a part that
 * must not be.
 */
const firstLetterCondition = (letters, isStartSearch) => {
  const charCodeQuery = toCharCodeQuery(letters);

  if (!SEARCH_OPERATORS.some((searchOperator) => charCodeQuery.includes(searchOperator))) {
    const operator = isStartSearch ? 'BEGINSWITH' : 'CONTAINS';
    const bindiQuery = toBindiQuery(charCodeQuery);
    const condition = `FirstLetterStr ${operator} '${charCodeQuery}'`;
    return bindiQuery === charCodeQuery
      ? condition
      : `(${condition} OR FirstLetterStr ${operator} '${bindiQuery}')`;
  }

  const matches = charCodeQuery.match(SEPARATE_AT_PLUS_OR_MINUS) || [];
  const conditions = [];
  matches.forEach((match) => {
    const pattern = match.replace(/\*+/g, '*').replace(/["']+/g, '');
    if (isStartSearch && matches.length === 1 && !match.includes('+') && !match.includes('-')) {
      conditions.push(`FirstLetterStr LIKE '${pattern}*'`);
    } else if (!pattern.includes('-')) {
      conditions.push(`FirstLetterStr LIKE '*${pattern.replace(/\++/g, '')}*'`);
    } else {
      conditions.push(`NOT FirstLetterStr LIKE '*${pattern.replace(/-+/g, '')}*'`);
    }
  });

  // Only quotes, or nothing the pattern above picks up.
  return conditions.length
    ? `(${conditions.join(' AND ')})`
    : `FirstLetterStr LIKE '${charCodeQuery.replace(/["']+/g, '')}'`;
};

const lowestShabadId = (verse) =>
  verse.Shabads.reduce(
    (lowest, { ShabadID }) => (ShabadID < lowest ? ShabadID : lowest),
    Number.MAX_SAFE_INTEGER,
  );

/**
 * First-letter results in banidb-api's order: shortest lines first for one or
 * two letters, then by shabad. Lines of one shabad stay in reading order.
 *
 * Realm can't sort by ShabadID (a line links to a list of shabads), so that
 * part is done here. For one or two letters only the shortest lines are read:
 * Realm sorts by length, and reading stops once whole length groups fill the
 * page.
 */
const sortFirstLetterResults = (rows, byLength, howManyRows) => {
  let verses;
  if (byLength) {
    verses = [];
    const byLengthRows = rows.sorted('FirstLetterLen');
    for (let i = 0, len = byLengthRows.length; i < len; i += 1) {
      const verse = byLengthRows[i];
      if (
        verses.length >= howManyRows &&
        verse.FirstLetterLen !== verses[verses.length - 1].FirstLetterLen
      ) {
        break;
      }
      verses.push(verse);
    }
  } else {
    verses = Array.from(rows);
  }

  return verses
    .map((verse) => ({
      verse,
      length: byLength ? verse.FirstLetterLen : 0,
      shabadId: lowestShabadId(verse),
      id: verse.ID,
    }))
    .sort((a, b) => a.length - b.length || a.shabadId - b.shabadId || a.id - b.id)
    .slice(0, howManyRows)
    .map(({ verse }) => verse);
};

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
    let isFirstLetterSearch = false;
    let sortByLength = false;
    let howManyRows = resultRows;
    switch (searchType) {
      case CONSTS.SEARCH_TYPES.FIRST_LETTERS: // First letter start
      case CONSTS.SEARCH_TYPES.FIRST_LETTERS_ANYWHERE: {
        // First letter anywhere
        const letters = searchQuery.replace(/\s+/g, '');
        condition = firstLetterCondition(letters, searchType === CONSTS.SEARCH_TYPES.FIRST_LETTERS);
        isFirstLetterSearch = true;
        sortByLength = letters.length < 3;
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
    Realm.open(realmConfig)
      .then((realm) => {
        const rows = realm.objects('Verse').filtered(condition);
        resolve(
          isFirstLetterSearch
            ? sortFirstLetterResults(rows, sortByLength, howManyRows)
            : rows.slice(0, howManyRows),
        );
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
const loadShabad = (ShabadID) =>
  new Promise((resolve, reject) => {
    if (!initialized) {
      init();
    }
    Realm.open(realmConfig)
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
    Realm.open(realmConfig)
      .then((realm) => {
        const condition = `Bani.ID == ${BaniID} AND ${BaniLength} == true`;
        const rows = realm.objects('Banis_Shabad').filtered(condition).sorted('Seq');
        if (rows.length > 0) {
          resolve(rows);
        }
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
    Realm.open(realmConfig)
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
    Realm.open(realmConfig)
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
    Realm.open(realmConfig)
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
    Realm.open(realmConfig)
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
    Realm.open(realmConfig)
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
    Realm.open(realmConfig)
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
    Realm.open(realmConfig)
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
    Realm.open(realmConfig)
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

    Realm.open(realmConfig)
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
  loadBanis,
  loadBani,
  loadCeremony,
  loadCeremonies,
  getAng,
  loadAng,
  getShabad,
  randomShabad,
  getVerse,
  getFilterOption,
};
