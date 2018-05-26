const allColumns = `v.ID, v.Gurmukhi, v.English, v.Transliteration, s.ShabadID, v.SourceID, v.PageNo AS PageNo, w.WriterEnglish, r.RaagEnglish FROM Verse v
LEFT JOIN Shabad s ON s.VerseID = v.ID AND s.ShabadID < 5000000
LEFT JOIN Writer w USING(WriterID)
LEFT JOIN Raag r USING(RaagID)`;

const CONSTS = require('./constants.js');

module.exports = {
  search(searchQuery, searchType) {
    let dbQuery = '';
    let searchCol = '';
    let condition = '';
    const order = [];
    const limit = ' 0,20';
    switch (searchType) {
      case CONSTS.SEARCH_TYPES.FIRST_LETTERS: // First letter start
      case CONSTS.SEARCH_TYPES.FIRST_LETTERS_ANYWHERE: { // First letter anywhere
        searchCol = 'v.FirstLetterStr';
        for (let x = 0, len = searchQuery.length; x < len; x += 1) {
          let charCode = searchQuery.charCodeAt(x);
          if (charCode < 100) {
            charCode = `0${charCode}`;
          }
          dbQuery += `,${charCode}`;
        }
        // Add trailing wildcard
        dbQuery += '%';
        if (searchType === 1) {
          dbQuery = `%${dbQuery}`;
        }
        // Replace kh with kh pair bindi
        let bindiQuery = '';
        if (dbQuery.includes('075')) {
          bindiQuery = `OR ${searchCol} LIKE '${dbQuery.replace(/075/g, '094')}'`;
        }
        condition = `${searchCol} LIKE '${dbQuery}' ${bindiQuery}`;
        if (searchQuery.length < 3) {
          order.push('v.FirstLetterLen');
        }
        break;
      }
      case CONSTS.SEARCH_TYPES.GURMUKHI_WORD: // Full word (Gurmukhi)
      case CONSTS.SEARCH_TYPES.ENGLISH_WORD: { // Full word (English)
        if (searchType === 2) {
          searchCol = 'v.Gurmukhi';
        } else {
          searchCol = 'v.English';
        }
        const words = searchQuery.split(' ');
        dbQuery = `%${words.join(' %')}%`;
        condition = `${searchCol} LIKE '${dbQuery}'`;
        break;
      }
      case CONSTS.SEARCH_TYPES.ANG: // Ang
        searchCol = 'PageNo';
        dbQuery = parseInt(searchQuery, 10);
        condition = `${searchCol} = ${dbQuery} AND v.SourceID = '${global.core.search.currentMeta.source || 'G'}'`;
        break;
      default:
        break;
    }
    order.push('s.ShabadID');
    const query = `SELECT ${allColumns} WHERE ${condition} ORDER BY ${order.join()} LIMIT ${limit}`;
    this.db.all(query, (err, rows) => {
      global.core.search.printResults(rows);
    });
  },

  loadShabad(ShabadID, LineID) {
    global.platform.db.all(`SELECT v.ID, v.Gurmukhi, v.SourceID, v.PageNo AS PageNo FROM Verse v LEFT JOIN Shabad s ON v.ID = s.VerseID WHERE s.ShabadID = '${ShabadID}' ORDER BY v.ID`, (err, rows) => {
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
