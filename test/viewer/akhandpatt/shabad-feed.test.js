/**
 * Reading Shabads for the infinitely scrolling deck.
 *
 * Covers gap tolerance and scripture boundaries. Shabad ids ascend but are not
 * contiguous, so a gap is not the end of a reading. They also ascend across
 * scriptures, where the reading must stop instead of continuing numerically.
 */

jest.mock('../../../www/main/banidb', () => ({ loadShabadSafe: jest.fn() }));

const banidb = require('../../../www/main/banidb');

const {
  readShabad,
  readNextShabad,
  readPrevShabad,
  MAX_SHABAD_ID_GAP,
} = require('../../../www/main/viewer/akhandpatt/shabad-feed');

const verseRow = (shabadId, sourceId) => ({
  ID: shabadId * 1000,
  Gurmukhi: `verse ${shabadId}`,
  ...(sourceId ? { Source: { SourceID: sourceId } } : {}),
});

/**
 * Serve a source whose only populated ids are those listed, so a gap is
 * an id that was left out. Rows carry no `Source`, which doubles as the case
 * where the DB does not supply one.
 */
const sourceWith = (populatedIds) => {
  banidb.loadShabadSafe.mockImplementation((shabadId) =>
    Promise.resolve(populatedIds.includes(shabadId) ? [verseRow(shabadId)] : []),
  );
};

/**
 * Serve ids that each belong to a named scripture, so a boundary is two
 * ids whose sources differ.
 */
const scripturesById = (sourceIdByShabadId) => {
  banidb.loadShabadSafe.mockImplementation((shabadId) =>
    Promise.resolve(
      sourceIdByShabadId[shabadId] ? [verseRow(shabadId, sourceIdByShabadId[shabadId])] : [],
    ),
  );
};

describe('readNextShabad', () => {
  it('steps over a gap in the id space', async () => {
    // 1640 is unused in the real SGGS, roughly a third of the way through.
    sourceWith([1639, 1641]);
    await expect(readNextShabad(1639)).resolves.toMatchObject({ shabadId: 1641 });
  });

  it('returns the immediate next id when there is no gap', async () => {
    sourceWith([10, 11]);
    await expect(readNextShabad(10)).resolves.toMatchObject({ shabadId: 11 });
  });

  it('reports the end of the source once the gap budget is spent', async () => {
    sourceWith([5540]);
    await expect(readNextShabad(5540)).resolves.toBeNull();
    // The budget, plus the one lookup that establishes the origin's scripture.
    expect(banidb.loadShabadSafe).toHaveBeenCalledTimes(MAX_SHABAD_ID_GAP + 1);
  });

  it('detaches verses from Realm rather than passing rows through', async () => {
    // Rows arrive as Realm proxies that revoke when their instance is reclaimed.
    // Only the fields the deck renders are copied, and by value.
    const row = {
      ID: 7,
      Gurmukhi: 'g',
      English: 'e',
      Translations: 't',
      Visraam: 'v',
      Shabads: [],
      Source: { SourceID: 'G' },
    };
    banidb.loadShabadSafe.mockResolvedValue([row]);
    const { verses } = await readShabad(7);
    expect(verses[0]).toEqual({
      ID: 7,
      Gurmukhi: 'g',
      English: 'e',
      Translations: 't',
      Visraam: 'v',
    });
    expect(verses[0]).not.toBe(row);
  });
});

describe('scripture boundaries', () => {
  // Two sources interleave in the DB: Bhai Gurdas Singh Ji Vaaran holds 41000
  // to 41027, inside the 40001 to 41711 held by Bhai Gurdas Ji Vaaran, and
  // 41028 belongs to the latter. No gap separates them, so the source check is
  // the only thing keeping a reading of one out of the other.
  const atTheJoin = { 41026: 'S', 41027: 'S', 41028: 'B', 41029: 'B' };

  it('ends the reading rather than rolling into the next scripture', async () => {
    scripturesById(atTheJoin);
    await expect(readNextShabad(41027)).resolves.toBeNull();
  });

  it('ends the reading walking backwards too', async () => {
    scripturesById(atTheJoin);
    await expect(readPrevShabad(41028)).resolves.toBeNull();
  });

  it('still steps over a gap within one scripture', async () => {
    // The check must not be so eager that it mistakes a gap for a boundary.
    scripturesById({ 1639: 'G', 1641: 'G' });
    await expect(readNextShabad(1639)).resolves.toMatchObject({ shabadId: 1641 });
  });

  it('reads on when the DB supplies no source to compare', async () => {
    // Stopping early would strand a programme; the gap budget still bounds it.
    sourceWith([10, 11]);
    await expect(readNextShabad(10)).resolves.toMatchObject({ shabadId: 11 });
  });

  it('covers the block it started in, not every id the source owns', async () => {
    // Sources interleave. Bhai Gurdas Ji Vaaran owns 41028, but 41000 to 41027
    // in between belong to Bhai Gurdas Singh Ji Vaaran, and the reading ends
    // there. The intervening id is inside the gap budget, so the scripture
    // check is unambiguously what ended it.
    scripturesById({ 40913: 'B', 40915: 'S', 41028: 'B' });
    await expect(readNextShabad(40913)).resolves.toBeNull();
    expect(40915 - 40913).toBeLessThan(MAX_SHABAD_ID_GAP);
  });

  it('stops at the end of the SGGS instead of reaching its curated extracts', async () => {
    // Anand Sahib and Japji Sahib are indexed at 333375 and above under the
    // SGGS's own SourceID, for the Banis feature. They are Gurbani the reader
    // has already passed, so a completed reading must end at 5540. The source
    // check cannot tell them apart, because the source is the same; only the
    // distance does. This is what an exact "next id in this source" query would
    // have to account for.
    scripturesById({ 5540: 'G', 333375: 'G' });
    await expect(readNextShabad(5540)).resolves.toBeNull();
  });
});

describe('readPrevShabad', () => {
  it('steps over a gap walking backwards', async () => {
    sourceWith([1639, 1641]);
    await expect(readPrevShabad(1641)).resolves.toMatchObject({ shabadId: 1639 });
  });

  it('stops at the start of the source without requesting id 0', async () => {
    // Ids are 1-indexed. Walking below that would thrash against empty results
    // on every wheel-up rather than settling.
    sourceWith([]);
    await expect(readPrevShabad(1)).resolves.toBeNull();
    expect(banidb.loadShabadSafe).not.toHaveBeenCalledWith(0);
  });
});

describe('readShabad', () => {
  it('returns the requested Shabad, never a neighbour', async () => {
    // Seeding must land on the Shabad the reader chose; an empty result is the
    // caller's cue to retry, not to move on.
    sourceWith([21]);
    await expect(readShabad(20)).resolves.toBeNull();
    expect(banidb.loadShabadSafe).toHaveBeenCalledTimes(1);
  });
});
