/**
 * Convert live Realm search-result rows into plain, detached JavaScript objects.
 *
 * Realm query results are *live*: each element is a proxy bound to the Realm
 * instance that produced it. That instance is opened per query in
 * {@link module:banidb/realm-search} and is reclaimed once a newer
 * `Realm.open` supersedes it (see the "multiple Realm.open calls" TODO there).
 * When it is reclaimed, every proxy it handed out is revoked. Any later access,
 * including the structural walk immer performs on the store slice that still
 * references them (`navigator.searchData`), then throws
 * `Cannot perform 'get' on a proxy that has been revoked`, unmounting the UI.
 *
 * This is especially easy to hit in Akhand Paatth mode, whose continuous scroll
 * issues a steady stream of `loadShabadSafe` calls (each a fresh `Realm.open`)
 * while stale search results linger in the store.
 *
 * Materialising the rows the moment they leave the data layer keeps only the
 * fields the search UI actually consumes (see `mapVerseItems` in
 * `SearchContent`) and severs the Realm binding entirely, so nothing revocable
 * ever reaches React state or the easy-peasy store.
 *
 * @param {Array|Realm.Results} rows Live Realm verse rows (or an empty result).
 * @returns {Array<object>} Plain objects mirroring the shape `mapVerseItems` reads.
 */
export const materializeSearchRows = (rows) =>
  Array.from(rows || []).map((verse) => ({
    ID: verse.ID,
    Gurmukhi: verse.Gurmukhi,
    PageNo: verse.PageNo,
    Raag: verse.Raag ? { RaagEnglish: verse.Raag.RaagEnglish } : null,
    Source: verse.Source
      ? { SourceEnglish: verse.Source.SourceEnglish, SourceID: verse.Source.SourceID }
      : null,
    Writer: verse.Writer ? { WriterEnglish: verse.Writer.WriterEnglish } : null,
    Shabads: verse.Shabads && verse.Shabads.length ? [{ ShabadID: verse.Shabads[0].ShabadID }] : [],
  }));
