/**
 * Reads Shabads from the source for the infinitely scrolling deck.
 *
 * It keeps three jobs out of the scroll hook: detaching rows from Realm before
 * they reach React state, stepping over unused Shabad ids, and stopping when the
 * ids run on into a different scripture.
 *
 * Shabad ids ascend, but a source does not own one unbroken run of them. The
 * SGGS skips 1640 and 4196, and asking for an unused id returns no verses;
 * reading that as the end of the source would strand an unattended Akhand
 * Paatth mid-programme, so a short run of empty ids is stepped over. Sources
 * also interleave, so an id that does exist may belong to another scripture,
 * which ends the reading instead of continuing it.
 */

const banidb = require('../../banidb');

/**
 * How many consecutive empty ids to step over before concluding that the source
 * has ended.
 *
 * This exists for the two holes in the SGGS, at 1640 and 4196. Both are a single
 * id, no other gap exists below 5540, and Dasam Bani's body (7402 to 12808) has
 * none at all, so ten is generous. A probe costs about 0.065ms, and probing only
 * happens at the end of a source.
 *
 * Widening it would not extend any reading. Where a reading stops short, the
 * next populated id belongs to a different source, which the scripture check
 * rejects however much budget is left; see `Reading past a wide gap` in the
 * README.
 */
export const MAX_SHABAD_ID_GAP = 10;

/** Shabad ids are 1-indexed, so this is the floor for backward reads. */
const FIRST_SHABAD_ID = 1;

// The only verse fields the deck (the `Slide` subtree) and the overlay
// (`filterOverlayVerseItems` + the downstream OBS / broadcast pipeline) ever
// read. Everything here is a scalar string, so copying them severs the Realm
// binding completely (see below) without pulling in any linked objects.
const VERSE_DISPLAY_FIELDS = ['ID', 'Gurmukhi', 'English', 'Translations', 'Visraam'];

// Detach verses from Realm the instant they load. The deck and the overlay hold
// them in React state across many later store actions; if the Realm instance
// that produced them is reclaimed (Akhand Paatth's continuous JIT loading opens
// a fresh one per Shabad) the proxies revoke and the next access throws.
//
// An explicit shallow pick (rather than `toJSON()`) is essential for
// performance: a Verse links to its `Shabads`, and each Shabad links back to
// all of its `Verses`, so `toJSON()` serialises that whole graph for every row,
// i.e. O(n^2) in the Shabad's length. On a long Shabad (e.g. 399 verses) that
// blocked the renderer for ~10s (white screen on load; frozen scroll controls
// mid-scroll). Copying the handful of scalar fields the UI actually consumes is
// O(n) and yields the exact plain shape those consumers already expect.
const materializeVerse = (row) => {
  const verse = {};
  VERSE_DISPLAY_FIELDS.forEach((field) => {
    verse[field] = row[field];
  });
  return verse;
};

const materializeVerses = (rows) => Array.from(rows || []).map(materializeVerse);

/**
 * Which scripture a Shabad belongs to, read straight off the Realm row.
 *
 * Not part of `VERSE_DISPLAY_FIELDS`: nothing renders it, so it is read here and
 * discarded rather than reaching React state. Null when the DB does not supply
 * one.
 */
const sourceIdOf = (rows) => {
  const first = rows && rows[0];
  return (first && first.Source && first.Source.SourceID) || null;
};

/** An unknown source never counts as a difference. See {@link readNextShabad}. */
const inDifferentScriptures = (a, b) => a !== null && b !== null && a !== b;

/**
 * Walk outwards from a candidate id until one yields verses in the same
 * scripture, the id space runs out, or the gap budget is spent.
 *
 * Recursive rather than a loop so each probe stays a plain promise chain; the
 * depth is bounded by `MAX_SHABAD_ID_GAP`.
 *
 * @param {number} candidateId Id to try
 * @param {1|-1} step Direction to walk on a miss
 * @param {number} remainingTries Probes left before giving up
 * @param {string|null} withinSourceId Scripture the reading belongs to
 * @returns {Promise<{shabadId: number, verses: object[]}|null>} Null once the scripture ends
 */
const readShabadFrom = (candidateId, step, remainingTries, withinSourceId) => {
  if (candidateId < FIRST_SHABAD_ID || remainingTries <= 0) {
    return Promise.resolve(null);
  }
  return banidb.loadShabadSafe(candidateId).then((rows) => {
    const verses = materializeVerses(rows);
    if (verses.length) {
      return inDifferentScriptures(withinSourceId, sourceIdOf(rows))
        ? null
        : { shabadId: candidateId, verses };
    }
    return readShabadFrom(candidateId + step, step, remainingTries - 1, withinSourceId);
  });
};

/**
 * The scripture a Shabad belongs to.
 *
 * One indexed lookup per Shabad boundary, which at reading pace is a few times
 * an hour. Carrying the source on the window model would save it, at the cost
 * of threading a new field through the model and every call site; the rule is
 * cheaper to keep whole, in the one module that decides what continues a
 * reading.
 */
const sourceOfShabad = (shabadId) => banidb.loadShabadSafe(shabadId).then(sourceIdOf);

/**
 * The Shabad with exactly this id, or null if it has no verses.
 *
 * Seeding uses this rather than the continuation readers: the reader chose a
 * specific Shabad, so landing on a neighbouring one would be wrong. An empty
 * result is the caller's cue to retry, not to move on.
 */
export const readShabad = (shabadId) =>
  banidb.loadShabadSafe(shabadId).then((rows) => {
    const verses = materializeVerses(rows);
    return verses.length ? { shabadId, verses } : null;
  });

/**
 * The next Shabad after `afterShabadId` that has verses, within the same
 * scripture. Null at the end of it.
 *
 * Ids ascend across scriptures as well as within them, so a reading that ran on
 * numerically would roll out of one and into the next. Two of the sources
 * interleave with no gap at all: Bhai Gurdas Singh Ji Vaaran holds 41000 to
 * 41027, inside the wider range held by Bhai Gurdas Ji Vaaran, and 41028
 * belongs to the latter. Only the source check keeps a reading of one out of
 * the other.
 *
 * When the DB supplies no source id the check is skipped rather than blocking:
 * a reading that stops early is a worse failure than one that runs on, and the
 * gap budget still bounds it.
 */
export const readNextShabad = (afterShabadId) =>
  sourceOfShabad(afterShabadId).then((sourceId) =>
    readShabadFrom(afterShabadId + 1, 1, MAX_SHABAD_ID_GAP, sourceId),
  );

/**
 * The nearest Shabad before `beforeShabadId` that has verses, within the same
 * scripture. Null at the start of it. See {@link readNextShabad} for why the
 * scripture is checked.
 */
export const readPrevShabad = (beforeShabadId) =>
  sourceOfShabad(beforeShabadId).then((sourceId) =>
    readShabadFrom(beforeShabadId - 1, -1, MAX_SHABAD_ID_GAP, sourceId),
  );
