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

// Search follows banidb-api (api/controllers/shabads.js and
// api/lib/searchOperators.js), so the app and the website return the same
// lines for the same query.
const SEARCH_OPERATORS = ['+', '-', '*', '"', "'"];
// A run of anything but + and -, with the + or - that leads it.
// eslint-disable-next-line no-control-regex
const SEPARATE_AT_PLUS_OR_MINUS = /[+-]?[\x00-\x2A\x2C\x2E-\x7F]+/g;

const hasSearchOperators = (text) =>
  SEARCH_OPERATORS.some((searchOperator) => text.includes(searchOperator));

// `?` and `\` are special in a Realm LIKE pattern; the user means them literally.
const escapeLike = (text) => text.replace(/[\\?]/g, '\\$&');

/**
 * A query with operators as LIKE patterns: `*` stands for any text, `+` joins
 * parts that must all be there and `-` leads a part that must not be. A
 * single part of a from-the-start search has to start the text; every other
 * part can be anywhere in it.
 *
 * `%` is taken as `*`: banidb-api joins main-letter words with it.
 */
const toOperatorPatterns = (text, { removeSpaces = false, isStartSearch = false } = {}) => {
  const matches = text.match(SEPARATE_AT_PLUS_OR_MINUS) || [];
  const patterns = [];

  matches.forEach((match) => {
    const part = (removeSpaces ? match.replace(/\s+/g, '') : match)
      .replace(/[*%]+/g, '*')
      .replace(/["']+/g, '');

    if (isStartSearch && matches.length === 1 && !match.includes('+') && !match.includes('-')) {
      patterns.push({ pattern: `${part}*`, isNegative: false });
    } else if (!part.includes('-')) {
      patterns.push({ pattern: `*${part.replace(/\++/g, '')}*`, isNegative: false });
    } else {
      patterns.push({ pattern: `*${part.replace(/-+/g, '')}*`, isNegative: true });
    }
  });

  // Only quotes, or nothing the pattern above picks up.
  return patterns.length
    ? patterns
    : [{ pattern: text.replace(/[*%]+/g, '*').replace(/["']+/g, ''), isNegative: false }];
};

// LIKE patterns on one column, as a Realm condition and its arguments.
const toLikeCondition = (column, patterns) => ({
  condition: `(${patterns
    .map(({ isNegative }, index) => `${isNegative ? 'NOT ' : ''}${column} LIKE $${index}`)
    .join(' AND ')})`,
  args: patterns.map(({ pattern }) => pattern),
});

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
 * First letters: plain letters match from the start of the line (or
 * anywhere), in either their plain or their bindi spelling.
 */
const firstLetterCondition = (letters, isStartSearch) => {
  const charCodeQuery = toCharCodeQuery(letters);

  if (hasSearchOperators(charCodeQuery)) {
    return toLikeCondition('FirstLetterStr', toOperatorPatterns(charCodeQuery, { isStartSearch }));
  }

  const operator = isStartSearch ? 'BEGINSWITH' : 'CONTAINS';
  const bindiQuery = toBindiQuery(charCodeQuery);
  return bindiQuery === charCodeQuery
    ? { condition: `FirstLetterStr ${operator} $0`, args: [charCodeQuery] }
    : {
        condition: `(FirstLetterStr ${operator} $0 OR FirstLetterStr ${operator} $1)`,
        args: [charCodeQuery, bindiQuery],
      };
};

// Full word (Gurmukhi): the line has the words as typed, in that order.
const fullWordGurmukhiCondition = (searchQuery) => {
  const words = searchQuery.replace(/(\[|\])/g, '');

  return hasSearchOperators(words)
    ? toLikeCondition('Gurmukhi', toOperatorPatterns(escapeLike(words), { removeSpaces: true }))
    : { condition: 'Gurmukhi CONTAINS $0', args: [words] };
};

// Main letters: the words in the order typed, with anything between them.
const mainLettersCondition = (searchQuery) => {
  const words = escapeLike(searchQuery).split(' ').join('%');

  return toLikeCondition(
    'MainLetters',
    hasSearchOperators(searchQuery)
      ? toOperatorPatterns(words, { removeSpaces: true })
      : [{ pattern: `*${words.replace(/%+/g, '*')}*`, isNegative: false }],
  );
};

const getBaniDbEnglish = (verse) => {
  try {
    return JSON.parse(verse.Translations).en.bdb || '';
  } catch (e) {
    return '';
  }
};

const likeToRegExp = (pattern) =>
  new RegExp(
    `^${pattern
      .split('*')
      .map((text) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('[\\s\\S]*')}$`,
    'i',
  );

/**
 * Full word (English): BaniDB's English translation has the text as typed,
 * in any letter case.
 *
 * Translations holds every translation as one JSON string, so Realm narrows
 * the lines down and `accept` checks BaniDB's translation alone.
 */
const fullWordEnglishCondition = (searchQuery) => {
  if (!hasSearchOperators(searchQuery)) {
    const text = searchQuery.toLowerCase();
    return {
      condition: 'Translations CONTAINS[c] $0',
      args: [searchQuery],
      accept: (verse) => getBaniDbEnglish(verse).toLowerCase().includes(text),
    };
  }

  const patterns = toOperatorPatterns(searchQuery).map(({ pattern, isNegative }) => ({
    pattern,
    isNegative,
    regExp: likeToRegExp(pattern),
  }));
  // Realm narrows down by the plain text of the parts that must be there;
  // CONTAINS is far quicker than LIKE on text this long.
  const wantedText = patterns
    .filter(({ isNegative }) => !isNegative)
    .reduce((texts, { pattern }) => texts.concat(pattern.split('*').filter(Boolean)), []);

  return {
    condition: wantedText.length
      ? `(${wantedText.map((_, index) => `Translations CONTAINS[c] $${index}`).join(' AND ')})`
      : 'TRUEPREDICATE',
    args: wantedText,
    accept: (verse) => {
      const english = getBaniDbEnglish(verse);
      return patterns.every(({ regExp, isNegative }) => regExp.test(english) !== isNegative);
    },
  };
};

const getShabadId = (verse) =>
  verse.Shabads.reduce(
    (lowest, { ShabadID }) => (ShabadID < lowest ? ShabadID : lowest),
    Number.MAX_SAFE_INTEGER,
  );

/*
 * Results are listed by ShabadID, as in banidb-api. Realm can't sort by it (a
 * line links to a list of shabads), and reading it line by line is too slow
 * when a search matches tens of thousands of lines.
 *
 * Line IDs follow shabad order from the first line on, apart from a few lines
 * placed elsewhere, until the sources stored after Dasam Granth. The index
 * holds how far that runs and which lines to skip. Up to there Realm can list
 * matches by ID and stop as soon as the page is full.
 */
const SORT_IN_JS_LIMIT = 3000;
const MAX_LINES_TO_SKIP = 500;
const LINES_PER_INDEX_STEP = 4000;
let shabadOrderIndex = null;
let isIndexingShabadOrder = false;

const toShabadOrderIndex = (ids, shabadIds) => {
  const total = ids.length;
  // Positions in ID order, sorted into shabad order.
  const inShabadOrder = Array.from(ids, (_, position) => position).sort(
    (a, b) => shabadIds[a] - shabadIds[b] || a - b,
  );

  // The leading lines whose IDs only go up.
  let leading = total ? 1 : 0;
  while (leading < total && inShabadOrder[leading] > inShabadOrder[leading - 1]) {
    leading += 1;
  }
  // The lines among them that come later in shabad order have to be skipped;
  // stop before that list gets long.
  const linesToSkip = (count) => inShabadOrder[count - 1] + 1 - count;
  while (leading > 0 && linesToSkip(leading) > MAX_LINES_TO_SKIP) {
    leading -= 1;
  }
  if (!leading) {
    return null;
  }

  const lastPosition = inShabadOrder[leading - 1];
  const isLeading = new Uint8Array(lastPosition + 1);
  for (let i = 0; i < leading; i += 1) {
    isLeading[inShabadOrder[i]] = 1;
  }
  const skip = new Set();
  for (let position = 0; position <= lastPosition; position += 1) {
    if (!isLeading[position]) {
      skip.add(ids[position]);
    }
  }

  return { lastId: ids[lastPosition], skip };
};

// Reads every line's shabad a few thousand at a time, so the app stays
// responsive. Until it finishes, searches sort in JS.
const indexShabadOrder = (realm) => {
  if (shabadOrderIndex || isIndexingShabadOrder) {
    return;
  }
  isIndexingShabadOrder = true;

  const verses = realm.objects('Verse').sorted('ID');
  const total = verses.length;
  const ids = new Int32Array(total);
  const shabadIds = new Float64Array(total);
  let position = 0;

  const readNextLines = () => {
    try {
      const end = Math.min(position + LINES_PER_INDEX_STEP, total);
      for (; position < end; position += 1) {
        ids[position] = verses[position].ID;
        shabadIds[position] = getShabadId(verses[position]);
      }
      if (position < total) {
        setTimeout(readNextLines, 0);
        return;
      }
      shabadOrderIndex = toShabadOrderIndex(ids, shabadIds);
    } catch (e) {
      // Without the index searches still work; broad ones are slower.
    }
    isIndexingShabadOrder = false;
  };
  setTimeout(readNextLines, 0);
};

const byShabad = (a, b) => a.shabadId - b.shabadId || a.id - b.id;

// A spread into push() runs out of stack on tens of thousands of lines.
const append = (list, items) => {
  for (let i = 0, len = items.length; i < len; i += 1) {
    list.push(items[i]);
  }
};

const sortByShabad = (verses) =>
  verses
    .map((verse) => ({ verse, shabadId: getShabadId(verse), id: verse.ID }))
    .sort(byShabad)
    .map(({ verse }) => verse);

/**
 * The matches of one search in banidb-api's order: by shabad, and for
 * `sortByLength` (one or two first letters) shortest lines first. Lines of
 * one shabad stay in reading order.
 *
 * `take(count)` gives the first `count` lines. The order is worked out only
 * as far as it is asked for and kept, because the results list asks for the
 * same search again and again, 20 lines more each time.
 */
const toOrderedMatches = (rows, { accept, sortByLength = false }) => {
  const isAccepted = (verse) => !accept || accept(verse);
  const ordered = [];
  // Each step adds the next lines in order to `ordered` and says whether
  // there are more to come.
  let readMore;

  if (sortByLength) {
    // Realm sorts by length; each length group is sorted by shabad here.
    const byLength = rows.sorted('FirstLetterLen');
    const total = byLength.length;
    let position = 0;
    readMore = () => {
      if (position >= total) {
        return false;
      }
      const group = [];
      const length = byLength[position].FirstLetterLen;
      while (position < total && byLength[position].FirstLetterLen === length) {
        group.push(byLength[position]);
        position += 1;
      }
      append(ordered, sortByShabad(group));
      return position < total;
    };
  } else if (shabadOrderIndex && rows.length > SORT_IN_JS_LIMIT) {
    // The leading lines in ID order, then everything else sorted here.
    const { lastId, skip } = shabadOrderIndex;
    const leading = rows.filtered('ID <= $0', lastId).sorted('ID');
    const total = leading.length;
    const skipped = [];
    let position = 0;
    readMore = () => {
      const end = Math.min(position + 200, total);
      for (; position < end; position += 1) {
        const verse = leading[position];
        if (skip.has(verse.ID)) {
          skipped.push(verse);
        } else if (isAccepted(verse)) {
          ordered.push(verse);
        }
      }
      if (position < total) {
        return true;
      }
      const rest = Array.from(rows.filtered('ID > $0', lastId)).concat(skipped);
      append(ordered, sortByShabad(rest.filter(isAccepted)));
      readMore = () => false;
      return false;
    };
  } else {
    readMore = () => {
      append(ordered, sortByShabad(Array.from(rows).filter(isAccepted)));
      readMore = () => false;
      return false;
    };
  }

  return {
    take: (count) => {
      let hasMore = true;
      while (hasMore && ordered.length < count) {
        hasMore = readMore();
      }
      return ordered.slice(0, count);
    },
  };
};

// The ordered matches of the latest search.
let latestMatches = { key: null, matches: null };

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
    // The words as typed, for the searches that follow banidb-api.
    const typedQuery = searchQuery.trim();
    let args = [];
    // Set for the searches listed in banidb-api's order.
    let shabadOrder = null;
    let howManyRows = resultRows;
    switch (searchType) {
      case CONSTS.SEARCH_TYPES.FIRST_LETTERS: // First letter start
      case CONSTS.SEARCH_TYPES.FIRST_LETTERS_ANYWHERE: {
        // First letter anywhere
        const letters = searchQuery.replace(/\s+/g, '');
        ({ condition, args } = firstLetterCondition(
          letters,
          searchType === CONSTS.SEARCH_TYPES.FIRST_LETTERS,
        ));
        shabadOrder = { sortByLength: letters.length < 3 };
        break;
      }
      case CONSTS.SEARCH_TYPES.GURMUKHI_WORD: // Full word (Gurmukhi)
        ({ condition, args } = fullWordGurmukhiCondition(typedQuery));
        shabadOrder = {};
        break;
      case CONSTS.SEARCH_TYPES.ENGLISH_WORD: {
        // Full word (English)
        const english = fullWordEnglishCondition(typedQuery);
        ({ condition, args } = english);
        shabadOrder = { accept: english.accept };
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
        ({ condition, args } = mainLettersCondition(typedQuery));
        shabadOrder = {};
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
    if (shabadOrder && searchSource !== 'all') {
      condition += ` AND Source.SourceID = $${args.length}`;
      args = [...args, searchSource];
    }
    Realm.open(realmConfig)
      .then((realm) => {
        const rows = realm.objects('Verse').filtered(condition, ...args);
        if (shabadOrder) {
          indexShabadOrder(realm);
          const key = JSON.stringify([searchType, condition, args]);
          if (latestMatches.key !== key) {
            latestMatches = { key, matches: toOrderedMatches(rows, shabadOrder) };
          }
          resolve(latestMatches.matches.take(howManyRows));
        } else {
          resolve(rows.slice(0, howManyRows));
        }
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
        // Always answer, even with no rows: a Bani with nothing at this length
        // used to leave the promise pending forever, silently stalling callers.
        resolve(realm.objects('Banis_Shabad').filtered(condition).sorted('Seq'));
      })
      .catch(reject);
  });

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
    Realm.open(realmConfig)
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
    Realm.open(realmConfig)
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
