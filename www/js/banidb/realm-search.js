/* eslint-disable import/no-dynamic-require, global-require */
const electron = require('electron');
const path = require('path');
const Realm = require('realm');

const CONSTS = require('./constants');

const { remote } = electron;
const userDataPath = remote.app.getPath('userData');
const realmPath = path.resolve(userDataPath, 'sttmdesktop-evergreen.realm');
const realmSchemaPath = path.resolve(userDataPath, 'realm-schema-evergreen.json');

// TODO: Investigate possible memory issues from multiple Realm.open calls
// https://github.com/KhalisFoundation/sttm-desktop/pull/517#discussion_r261644205
const realmConfig = {
  path: realmPath,
};

let initialized = false;

const init = () => {
  const realmSchema = require(realmSchemaPath);

  realmConfig.schema = realmSchema.schemas;
  realmConfig.schemaVersion = realmSchema.schemaVersion;
  initialized = true;
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
const query = (searchQuery, searchType, searchSource) =>
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
    let howManyRows = 20;
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

        // Replace kh with kh pair bindi
        let replaced = '';
        if (dbQuery.includes('075')) {
          replaced = `OR ${searchCol} ${operator} '${dbQuery.replace(/075/g, '094')}'`;
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
          searchCol = 'English';
          caseInsensitive = true;
        }
        const words = saniQuery
          .split(' ')
          .map(
            word =>
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
        condition = `${searchCol} = ${dbQuery}`;

        switch (global.core.search.currentMeta.source) {
          case null:
            break;
          default:
            angSearchSourceId = global.core.search.currentMeta.source;
            break;
        }
        condition = `${searchCol} = ${dbQuery} AND Source.SourceID = '${angSearchSourceId}'`;
        break;
      default:
        break;
    }
    order.push('Shabads');
    condition = `${condition} SORT(${order.join(' ASC, ')} ASC)`;
    Realm.open(realmConfig)
      .then(realm => {
        const rows = realm.objects('Verse').filtered(condition);
        resolve(rows.slice(0, howManyRows));
      })
      .catch(reject);
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
const loadShabad = ShabadID =>
  new Promise((resolve, reject) => {
    if (!initialized) {
      init();
    }
    Realm.open(realmConfig)
      .then(realm => {
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
      .then(realm => {
        const condition = `Bani.ID == ${BaniID} AND ${BaniLength} == true`;
        const rows = realm
          .objects('Banis_Shabad')
          .filtered(condition)
          .sorted('Seq');
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

const loadCeremony = ceremonyID =>
  new Promise((resolve, reject) => {
    if (!initialized) {
      init();
    }
    Realm.open(realmConfig)
      .then(realm => {
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
      .then(realm => {
        const rows = realm
          .objects('Banis')
          .filtered('ID < 10000')
          .sorted('ID');
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
      .then(realm => {
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
const getAng = ShabadID =>
  new Promise(resolve => {
    if (!initialized) {
      init();
    }
    Realm.open(realmConfig).then(realm => {
      const row = realm.objects('Verse').filtered('ANY Shabads.ShabadID == $0', ShabadID)[0];
      const { PageNo, Source } = row;
      resolve({
        PageNo,
        SourceID: Source.SourceID,
      });
    });
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
    Realm.open(realmConfig).then(realm => {
      const rows = realm
        .objects('Verse')
        .filtered('PageNo = $0 AND Source.SourceID = $1', PageNo, SourceID);
      if (rows.length > 0) {
        resolve(rows);
      } else {
        reject();
      }
    });
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
const getShabad = VerseID =>
  new Promise(resolve => {
    if (!initialized) {
      init();
    }
    Realm.open(realmConfig).then(realm => {
      const shabad = realm.objects('Verse').filtered('ID = $0', VerseID)[0];
      resolve(shabad.Shabads[0].ShabadID);
    });
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
  new Promise(resolve => {
    Realm.open(realmConfig).then(realm => {
      const rows = realm.objects('Verse').filtered('Source.SourceID = $0', SourceID);
      const row = rows[Math.floor(Math.random() * rows.length)];
      resolve(row.Shabads[0].ShabadID);
    });
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
};
