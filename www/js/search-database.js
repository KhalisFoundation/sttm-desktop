const Realm = require('realm');
const realmDB = require('./realm-db');

const CONSTS = require('./constants.js');

module.exports = {
  search(searchQuery, searchType, searchSource) {
    let dbQuery = '';
    let searchCol = '';
    let condition = '';
    // Sanitize query
    const saniQuery = searchQuery.trim().replace("'", "\\'");
    // default source for ang search to GURU_GRANTH_SAHIB
    let angSearchSourceId = CONSTS.SOURCE_TYPES.GURU_GRANTH_SAHIB;
    const order = [];
    switch (searchType) {
      case CONSTS.SEARCH_TYPES.FIRST_LETTERS: // First letter start
      case CONSTS.SEARCH_TYPES.FIRST_LETTERS_ANYWHERE: { // First letter anywhere
        searchCol = 'FirstLetterStr';
        const operator = searchType === CONSTS.SEARCH_TYPES.FIRST_LETTERS ? 'BEGINSWITH' : 'CONTAINS';
        for (let x = 0, len = saniQuery.length; x < len; x += 1) {
          let charCode = saniQuery.charCodeAt(x);
          if (charCode < 100) {
            charCode = `0${charCode}`;
          }
          dbQuery += `,${charCode}`;
        }

        // Replace kh with kh pair bindi
        let replaced = '';
        if (dbQuery.includes('075')) {
          replaced = `OR ${searchCol} ${operator} '${dbQuery.replace(/075/g, '094')}'`;
        }
        condition = `${searchCol} ${operator} '${dbQuery}' ${replaced}`;
        if (saniQuery.length < 3) {
          order.push('FirstLetterLen');
        }
        break;
      }
      case CONSTS.SEARCH_TYPES.GURMUKHI_WORD: // Full word (Gurmukhi)
      case CONSTS.SEARCH_TYPES.ENGLISH_WORD: { // Full word (English)
        let caseInsensitive = false;
        if (searchType === 2) {
          searchCol = 'Gurmukhi';
        } else {
          searchCol = 'English';
          caseInsensitive = true;
        }
        const words = saniQuery.split(' ').map(word => `(${searchCol} CONTAINS${caseInsensitive ? '[c]' : ''} ' ${word}' OR ${searchCol} BEGINSWITH${caseInsensitive ? '[c]' : ''} '${word}')`);
        condition = words.join(' AND ');
        if (searchSource !== 'all') {
          condition += ` AND Source.SourceID = '${searchSource}'`;
        }
        break;
      }
      case CONSTS.SEARCH_TYPES.ANG: // Ang
        searchCol = 'PageNo';
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
    Realm.open(realmDB.realmVerseSchema)
      .then((realm) => {
        const rows = realm.objects('Verse').filtered(condition);
        global.core.search.printResults(rows.slice(0, 20));
      });
  },

  loadShabad(ShabadID, LineID) {
    Realm.open(realmDB.realmVerseSchema)
      .then((realm) => {
        const rows = realm.objects('Verse').filtered('ANY Shabads.ShabadID == $0', ShabadID);
        if (rows.length > 0) {
          global.core.search.printShabad(rows, ShabadID, LineID || rows[0].ID);
        }
      });
  },

  getAng(ShabadID) {
    return new Promise((resolve) => {
      Realm.open(realmDB.realmVerseSchema)
        .then((realm) => {
          const row = realm.objects('Verse').filtered('ANY Shabads.ShabadID == $0', ShabadID)[0];
          const { PageNo, SourceID } = row;
          resolve({
            PageNo,
            SourceID,
          });
        });
    });
  },

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
  loadAng(PageNo, SourceID = 'G') {
    return new Promise((resolve, reject) => {
      Realm.open(realmDB.realmVerseSchema)
        .then((realm) => {
          const rows = realm.objects('Verse').filtered('PageNo = $0 AND Source.SourceID = $1', PageNo, SourceID);
          if (rows.length > 0) {
            resolve(rows);
          } else {
            reject();
          }
        });
    });
  },

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
  getShabad(VerseID) {
    return new Promise((resolve) => {
      Realm.open(realmDB.realmVerseSchema)
        .then((realm) => {
          const shabad = realm.objects('Verse').filtered('ID = $0', VerseID)[0];
          resolve(shabad.Shabads[0].ShabadID);
        });
    });
  },

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
  randomShabad(SourceID = 'G') {
    return new Promise((resolve) => {
      Realm.open(realmDB.realmVerseSchema)
        .then((realm) => {
          const rows = realm.objects('Verse').filtered('Source.SourceID = $0', SourceID);
          const row = rows[Math.floor(Math.random() * rows.length)];
          resolve(row.Shabads[0].ShabadID);
        });
    });
  },
};
