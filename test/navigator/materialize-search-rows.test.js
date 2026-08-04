/**
 * @jest-environment node
 */
const { materializeSearchRows } = require('../../www/main/navigator/utils/materialize-search-rows');

// Stands in for a live Realm row: linked properties are getters on a proxy
// rather than own enumerable data, which is why the store cannot hold one.
const realmVerse = (overrides = {}) => ({
  ID: 1234,
  Gurmukhi: 'test verse',
  PageNo: 10,
  Raag: { RaagEnglish: 'Raag Sri' },
  Source: { SourceEnglish: 'Sri Guru Granth Sahib Ji', SourceID: 'G' },
  Writer: { WriterEnglish: 'Guru Nanak Dev Ji' },
  Shabads: [{ ShabadID: 42 }],
  ...overrides,
});

describe('materializeSearchRows', () => {
  test('keeps the fields the search list reads', () => {
    const [row] = materializeSearchRows([realmVerse()]);

    expect(row).toEqual({
      ID: 1234,
      Gurmukhi: 'test verse',
      PageNo: 10,
      Raag: { RaagEnglish: 'Raag Sri' },
      Source: { SourceEnglish: 'Sri Guru Granth Sahib Ji', SourceID: 'G' },
      Writer: { WriterEnglish: 'Guru Nanak Dev Ji' },
      Shabads: [{ ShabadID: 42 }],
    });
  });

  test('detaches every row from the object it came from', () => {
    const source = realmVerse();
    const [row] = materializeSearchRows([source]);

    // Nothing the store holds may still point at a Realm-owned object, because
    // those are revoked when a later query supersedes the Realm that made them.
    expect(row).not.toBe(source);
    expect(row.Raag).not.toBe(source.Raag);
    expect(row.Source).not.toBe(source.Source);
    expect(row.Writer).not.toBe(source.Writer);
    expect(row.Shabads).not.toBe(source.Shabads);
    expect(row.Shabads[0]).not.toBe(source.Shabads[0]);
  });

  test.each([
    ['missing', undefined],
    ['empty', []],
    ['null', null],
  ])('always yields a Shabads array when the link is %s', (_label, Shabads) => {
    const [row] = materializeSearchRows([realmVerse({ Shabads })]);

    // The search list indexes into this, so it has to be an array whatever the
    // database returned.
    expect(Array.isArray(row.Shabads)).toBe(true);
  });

  test.each([
    ['Raag', 'Raag'],
    ['Source', 'Source'],
    ['Writer', 'Writer'],
  ])('yields null rather than throwing when %s is absent', (_label, field) => {
    const [row] = materializeSearchRows([realmVerse({ [field]: undefined })]);

    expect(row[field]).toBeNull();
  });

  test('accepts an iterable that is not an array, as Realm results are', () => {
    const results = {
      *[Symbol.iterator]() {
        yield realmVerse();
        yield realmVerse({ ID: 5678 });
      },
    };

    expect(materializeSearchRows(results).map((row) => row.ID)).toEqual([1234, 5678]);
  });

  test.each([
    ['undefined', undefined],
    ['null', null],
  ])('yields an empty list when the query returned %s', (_label, rows) => {
    expect(materializeSearchRows(rows)).toEqual([]);
  });
});
