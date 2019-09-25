const sqlite3 = require('sqlite3').verbose();
const electron = require('electron');
const path = require('path');

const { remote } = electron;
const userDataPath = remote.app.getPath('userData');
const dbPath = path.resolve(userDataPath, 'sttmdesktop.db');

let db;
let initialized = false;

const init = () => {
  db = new sqlite3.Database(dbPath);
  initialized = true;
};

const CONSTS = require('./constants');

const allColumns = `v.ID, v.Gurmukhi, v.English, v.Transliteration, v.Visraam, v.Punjabi, s.ShabadID, v.SourceID, v.PageNo AS PageNo, w.WriterEnglish, r.RaagEnglish FROM Verse v
LEFT JOIN Shabad s ON s.VerseID = v.ID AND s.ShabadID < 5000000
LEFT JOIN Writer w USING(WriterID)
LEFT JOIN Raag r USING(RaagID)`;

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
    let isWildChar = false;

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
        searchCol = 'v.FirstLetterStr';
        for (let x = 0, len = saniQuery.length; x < len; x += 1) {
          let charCode = saniQuery.charCodeAt(x);
          if (charCode < 100) {
            charCode = `0${charCode}`;
          }
          if (charCode === '042') {
            isWildChar = true;
            dbQuery += ',___';
          } else {
            dbQuery += `,${charCode}`;
          }
        }

        // Replace kh with kh pair bindi
        let replaced = '';
        if (dbQuery.includes('075')) {
          replaced = dbQuery.replace(/075/g, '094');
        }

        // Use LIKE if anywhere, otherwise use operators
        if (searchType === CONSTS.SEARCH_TYPES.FIRST_LETTERS_ANYWHERE || isWildChar) {
          condition = `${searchCol} LIKE '%${dbQuery}%'`;
          if (replaced) {
            condition += ` OR ${searchCol} LIKE '%${replaced}%'`;
          }
        } else {
          condition = `(${searchCol} > '${dbQuery}' AND ${searchCol} < '${dbQuery},z')`;
          if (replaced) {
            condition += ` OR (${searchCol} > '${replaced}' AND ${searchCol} < '${replaced},z')`;
          }
        }
        if (searchSource !== 'all') {
          condition += `  AND v.SourceID = '${searchSource}'`;
        }

        // Give preference to shorter lines if searching for 1 or 2 words
        if (searchQuery.length < 3) {
          order.push('v.FirstLetterLen');
        }
        break;
      }
      case CONSTS.SEARCH_TYPES.GURMUKHI_WORD: // Full word (Gurmukhi)
      case CONSTS.SEARCH_TYPES.ENGLISH_WORD: {
        // Full word (English)
        if (searchType === 2) {
          searchCol = 'v.Gurmukhi';
        } else {
          searchCol = 'v.English';
        }
        const words = saniQuery
          .split(' ')
          .map(word => `(${searchCol} LIKE '% ${word}%' OR ${searchCol} LIKE '${word}%')`);
        condition = words.join(' AND ');
        if (searchSource !== 'all') {
          condition += ` AND v.SourceID = '${searchSource}'`;
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
        condition = `${searchCol} = ${dbQuery} AND v.SourceID = '${angSearchSourceId}'`;
        break;
      default:
        break;
    }
    order.push('s.ShabadID');
    const q = `SELECT ${allColumns} WHERE ${condition} ORDER BY ${order.join()} LIMIT ${howManyRows}`;
    db.all(q, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        rows.map(row => {
          /* eslint-disable no-param-reassign */
          row.Shabads = [{ ShabadID: row.ShabadID }];
          row.Source = { SourceID: row.SourceID };
          /* eslint-enable */
          return row;
        });
        resolve(rows);
      }
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
const loadShabad = ShabadID =>
  new Promise((resolve, reject) => {
    if (!initialized) {
      init();
    }
    db.all(
      `SELECT v.ID, v.Gurmukhi, v.MainLetters, v.Visraam, v.English, v.Transliteration, v.punjabi, v.SourceID, v.PageNo AS PageNo FROM Verse v LEFT JOIN Shabad s ON v.ID = s.VerseID WHERE s.ShabadID = '${ShabadID}' ORDER BY v.ID`,
      (err, rows) => {
        if (err) {
          reject(err);
        } else if (rows.length > 0) {
          resolve(rows);
        }
      },
    );
  });

/**
 * Retrieve all lines from a Ceremony
 *
 * @param {number} CeremonyID The specific Ceremony to get
 * @returns {object} Returns array of objects for each line
 * @example
 *
 * loadCeremony(3);
 * // => [{ Gurmukhi: 'jo gurisK guru syvdy sy puMn prwxI ]', ID: 31057 },...]
 */
const loadCeremony = CeremonyID =>
  new Promise((resolve, reject) => {
    if (!initialized) {
      init();
    }
    db.all(
      `SELECT v.ID, v.Gurmukhi, v.LineNo, v.English, v.Transliteration,
      v.Visraam, v.Punjabi, v.SourceID, v.MainLetters,
      c.Token, c.Gurmukhi as CeremonyGurmukhi, c.Transliteration as ceremonyTransliteration,
      cs.Custom, cs.VerseIDRangeEnd, cs.VerseIDRangeStart,
      cc.English AS ceremonyEnglish, v.PageNo 
      AS PageNo
      FROM Ceremonies_Shabad cs
      LEFT JOIN Ceremonies c ON cs.Ceremony = c.ID
      LEFT JOIN Verse v  ON v.ID = cs.VerseID 
      LEFT JOIN Ceremonies_Custom cc ON cs.Custom = cc.ID
      WHERE cs.Ceremony = ${CeremonyID} 
      ORDER BY cs.Seq`,
      (err, rows) => {
        if (err) {
          reject(err);
        } else if (rows.length > 0) {
          const rowsMapped = rows.map(rawRow => {
            const row = Object.assign({}, rawRow);
            row.Ceremony = {
              Token: row.Token,
              Gurmukhi: row.CeremonyGurmukhi,
            };
            const customID = row.Custom;
            row.Custom = {
              ID: customID,
              English: row.ceremonyEnglish,
            };
            row.Verse = {
              Gurmukhi: row.Gurmukhi,
              MainLetters: row.MainLetters,
              Translations: row.Translations,
              Transliteration: row.Transliteration,
              English: row.English,
              Visraam: row.Visraam,
              SourceID: row.SourceID,
              ID: row.ID,
              LineNo: row.LineNo,
              PageNo: row.PageNo,
              Punjabi: row.Punjabi,
            };

            return row;
          });
          if (!rowsMapped[0].Gurmukhi) {
            rowsMapped[0].Custom.Gurmukhi = rows[0].CeremonyGurmukhi;
            rowsMapped[0].Custom.Transliteration = rows[0].ceremonyTransliteration;
          }
          resolve(rowsMapped);
        }
      },
    );
  });

const loadVerses = (start, end) =>
  new Promise((resolve, reject) => {
    if (!initialized) {
      init();
    }
    db.all(
      `SELECT v.ID, v.Gurmukhi, v.MainLetters, v.Visraam, v.English, v.Transliteration, v.punjabi, v.SourceID, v.PageNo AS PageNo 
      FROM Verse v
      LEFT JOIN Shabad s 
      ON v.ID = s.VerseID
      WHERE v.ID >= ${start}
      AND v.ID <= ${end}
      ORDER BY v.ID`,
      (err, rows) => {
        if (err) {
          reject(err);
        } else if (rows.length > 0) {
          resolve(rows);
        }
      },
    );
  });

/**
 * Retrieve all ceremonies
 *
 * @returns {object} Returns array of objects for each ceremony
 * @example
 *
 * loadCeremonies();
 * "AnMd kwrj"
 * // => [{ Gurmukhi:  "AnMd kwrj", ID: 1 ... },...]
 */
const loadCeremonies = () =>
  new Promise((resolve, reject) => {
    if (!initialized) {
      init();
    }
    db.all('SELECT * FROM Ceremonies ORDER BY ID', (err, rows) => {
      if (err) {
        reject(err);
      } else if (rows.length > 0) {
        resolve(rows);
      }
    });
  });

/**
 * Retrieve all banis from database
 *
 * @returns {object} Returns array of objects containing all banis
 *
 */

const loadBanis = () =>
  new Promise((resolve, reject) => {
    if (!initialized) {
      init();
    }
    db.all(
      'SELECT ID, Token, Gurmukhi, GurmukhiUni, Transliteration FROM Banis WHERE ID < 10000 ORDER BY ID',
      (err, rows) => {
        if (err) {
          reject(err);
        } else if (rows.length > 0) {
          resolve(rows);
        }
      },
    );
  });

/**
 * Retrieve all lines from a Bani
 *
 * @param {number} BaniID The specific Bani to get
 * @returns {object} Returns array of objects for each line
 *
 */

const loadBani = (BaniID, BaniLength) =>
  new Promise((resolve, reject) => {
    if (!initialized) {
      init();
    }
    db.all(
      `SELECT v.ID, v.Gurmukhi, v.Visraam, v.MainLetters, v.English, v.Transliteration,
      v.punjabiUni, v.punjabi,  v.SourceID, v.PageNo AS PageNo, c.Token, c.Gurmukhi as nameOfBani,
      c.ID as BaniID, b.existsSGPC, b.existsMedium,
      b.existsTaksal, b.existsBuddhaDal, b.MangalPosition
      FROM Verse v
      LEFT JOIN Banis_Shabad b ON v.ID = b.VerseID
      LEFT JOIN Banis c ON c.ID = ${BaniID}
      WHERE b.Bani = ${BaniID}
      AND b.${BaniLength} = true
      ORDER BY b.Seq`,
      (err, rows) => {
        if (err) {
          reject(err);
        } else if (rows.length > 0) {
          resolve(rows);
        }
      },
    );
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
    const q = `SELECT ${allColumns} WHERE s.ShabadID = ?`;
    db.get(q, [ShabadID], (err, row) => {
      resolve({
        PageNo: row.PageNo,
        SourceID: row.SourceID,
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
    global.platform.db.all(
      `SELECT ${allColumns} WHERE PageNo = ${PageNo} AND SourceID = '${SourceID}'`,
      (err, rows) => {
        if (rows.length > 0) {
          resolve(rows);
        } else {
          reject();
        }
      },
    );
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
    db.get('SELECT ShabadID FROM Shabad WHERE VerseID = ?', [VerseID], (err, row) => {
      resolve(row.ShabadID);
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
    if (!initialized) {
      init();
    }
    db.get(
      'SELECT DISTINCT s.ShabadID, v.PageNo FROM Shabad s JOIN Verse v ON s.VerseID = v.ID WHERE v.SourceID = ? ORDER BY RANDOM() LIMIT 1',
      [SourceID],
      (err, row) => {
        resolve(row.ShabadID);
      },
    );
  });

// Re-export CONSTS for use in other areas
module.exports = {
  CONSTS,
  query,
  loadShabad,
  loadCeremony,
  loadCeremonies,
  loadVerses,
  loadBanis,
  loadBani,
  getAng,
  loadAng,
  getShabad,
  randomShabad,
};
