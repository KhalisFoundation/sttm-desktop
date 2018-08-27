const Realm = require('realm');
const realmDB = require('./realm-db');

const allColumns = `v.ID, v.Gurmukhi, v.English, v.Transliteration, v.punjabiUni, s.ShabadID, v.SourceID, v.PageNo AS PageNo, w.WriterEnglish, r.RaagEnglish FROM Verse v
LEFT JOIN Shabad s ON s.VerseID = v.ID AND s.ShabadID < 5000000
LEFT JOIN Writer w USING(WriterID)
LEFT JOIN Raag r USING(RaagID)`;

const CONSTS = require('./constants.js');

module.exports = {
  search(searchQuery, searchType, searchSource) {
    let dbQuery = '';
    let searchCol = '';
    let condition = '';
    // default source for ang search to GURU_GRANTH_SAHIB
    let angSearchSourceId = CONSTS.SOURCE_TYPES.GURU_GRANTH_SAHIB;
    const order = [];
    switch (searchType) {
      case CONSTS.SEARCH_TYPES.FIRST_LETTERS: // First letter start
      case CONSTS.SEARCH_TYPES.FIRST_LETTERS_ANYWHERE: { // First letter anywhere
        searchCol = 'FirstLetterStr';
        for (let x = 0, len = searchQuery.length; x < len; x += 1) {
          let charCode = searchQuery.charCodeAt(x);
          if (charCode < 100) {
            charCode = `0${charCode}`;
          }
          dbQuery += `,${charCode}`;
        }

        // Replace kh with kh pair bindi
        let replaced = '';
        if (dbQuery.includes('075')) {
          replaced = `OR ${searchCol} CONTAINS '${dbQuery.replace(/075/g, '094')}'`;
        }
        condition = `${searchCol} CONTAINS '${dbQuery}' ${replaced}`;
        if (searchQuery.length < 3) {
          order.push('v.FirstLetterLen');
        }
        break;
      }
      case CONSTS.SEARCH_TYPES.GURMUKHI_WORD: // Full word (Gurmukhi)
      case CONSTS.SEARCH_TYPES.ENGLISH_WORD: { // Full word (English)
        if (searchType === 2) {
          searchCol = 'Gurmukhi';
        } else {
          searchCol = 'English';
        }
        const words = searchQuery.split(' ').map(word => `${searchCol} CONTAINS ${word}`);
        condition = words.join(' AND ');
        if (searchSource !== 'all') {
          condition += ` AND v.SourceID = '${searchSource}'`;
        }
        break;
      }
      case CONSTS.SEARCH_TYPES.ANG: // Ang
        searchCol = 'PageNo';
        dbQuery = parseInt(searchQuery, 10);
        condition = `${searchCol} = ${dbQuery}`;

        switch (global.core.search.currentMeta.source) {
          case null:
            break;
          default:
            angSearchSourceId = global.core.search.currentMeta.source;
            break;
        }
        condition = `${searchCol} = ${dbQuery} AND v.SourceID = '${angSearchSourceId}'`;
        break;
      default:
        break;
    }
    order.push('Shabads');
    condition = `${condition} SORT(${order.join(' ASC, ')} ASC)`;
    console.time('query');
    Realm.open(realmDB.realmVerseSchema)
      .then((realm) => {
        const rows = realm.objects('Verse').filtered(condition);
        global.core.search.printResults(rows.slice(0, 20));
        console.timeEnd('query');
      });
  },

  loadShabad(ShabadID, LineID) {
    global.platform.db.all(`SELECT v.ID, v.Gurmukhi, v.English, v.Transliteration, v.punjabiUni, v.SourceID, v.PageNo AS PageNo FROM Verse v LEFT JOIN Shabad s ON v.ID = s.VerseID WHERE s.ShabadID = '${ShabadID}' ORDER BY v.ID`, (err, rows) => {
      if (rows.length > 0) {
        global.core.search.printShabad(rows, ShabadID, LineID || rows[0].ID);
      }
    });
  },

  getAng(ShabadID) {
    return new Promise((resolve) => {
      const query = `SELECT ${allColumns} WHERE s.ShabadID = ?`;
      global.platform.db.get(query, [ShabadID],
      (err, row) => {
        resolve({
          PageNo: row.PageNo,
          SourceID: row.SourceID,
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
      global.platform.db.all(`SELECT ${allColumns} WHERE PageNo = ${PageNo} AND SourceID = '${SourceID}'`,
      (err, rows) => {
        if (rows.length > 0) {
          resolve(rows);
        } else {
          reject();
        }
      });
    });
  },

  loadAdjacentShabad(previousVerseID, nextVerseID, Forward) {
    global.platform.db.all(`
    SELECT
      'previous' as navigation, ShabadID
    FROM
      Shabad
    WHERE
      VerseID='${previousVerseID}'
    UNION
    SELECT
      'next' as navigation, ShabadID
    FROM
      Shabad
    WHERE
      VerseID='${nextVerseID}'`,
    (err, adjacentShabads) => {
      if (adjacentShabads.length > 0) {
        const ShabadID = Forward ? adjacentShabads[0].ShabadID : adjacentShabads[1].ShabadID;
        this.loadShabad(ShabadID, null);
      }
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
      global.platform.db.get('SELECT DISTINCT s.ShabadID, v.PageNo FROM Shabad s JOIN Verse v ON s.VerseID = v.ID WHERE v.SourceID = ? ORDER BY RANDOM() LIMIT 1',
      [SourceID],
      (err, row) => {
        resolve(row.ShabadID);
      });
    });
  },
};
