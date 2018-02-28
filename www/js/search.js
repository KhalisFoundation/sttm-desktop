module.exports = {
  search(searchQuery, searchType) {
    let dbQuery = '';
    let bindiQuery = '';
    let searchCol = '';
    switch (searchType) {
      case 0: // First letter start
      case 1: // First letter anywhere
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
        if (dbQuery.includes('075')) {
          bindiQuery = dbQuery.replace(/075/g, '094');
        }
        break;
      case 2: // Full word (Gurmukhi)
      case 3: { // Full word (English)
        if (searchType === 2) {
          searchCol = 'v.Gurmukhi';
        } else {
          searchCol = 'v.English';
        }
        const words = searchQuery.split(' ');
        dbQuery = `%${words.join(' %')}%`;
        break;
      }
      default:
        break;
    }
    let initQuery = `SELECT v.ID, v.Gurmukhi, v.English, v.Transliteration, s.ShabadID, v.SourceID, v.PageNo AS PageNo, w.WriterEnglish, r.RaagEnglish FROM Verse v
    LEFT JOIN Shabad s ON s.VerseID = v.ID AND s.ShabadID < 5000000
    LEFT JOIN Writer w USING(WriterID)
    LEFT JOIN Raag r USING(RaagID) WHERE ${searchCol} LIKE '${dbQuery}'`;

    if (bindiQuery) {
      initQuery += `OR ${searchCol} LIKE '${bindiQuery}'`;
    }

    const query = `${initQuery}  LIMIT 0,20`;

    this.db.all(query, (err, rows) => {
      global.core.search.printResults(rows);
    });
  },

  loadShabad(ShabadID, LineID) {
    global.platform.db.all(`SELECT v.ID, v.Gurmukhi FROM Verse v LEFT JOIN Shabad s ON v.ID = s.VerseID WHERE s.ShabadID = '${ShabadID}' ORDER BY v.ID`, (err, rows) => {
      if (rows.length > 0) {
        global.core.search.printShabad(rows, ShabadID, LineID);
      }
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
};
