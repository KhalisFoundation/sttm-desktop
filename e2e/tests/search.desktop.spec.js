const { expect, test } = require('../support/launch-app');
const { compact, firstLetters } = require('../support/search-window');
const { sheetCase } = require('../support/sheet');

test.describe('Search @fast', () => {
  test(
    sheetCase('SRCH-01', 'Guru Granth Sahib: "qnjqnh" finds Teerath Naavan Jao'),
    async ({ search }) => {
      await search.search('qnjqnh');
      expect(await search.indexOfResult('qIriQ nwvx jwau qIrQu nwmu hY')).toBe(0);
    },
  );

  test(sheetCase('SRCH-02', 'Dasam Granth: "sksls" finds Sach Kahoun Sun'), async ({ search }) => {
    await search.search('sksls');
    expect(await search.indexOfResult('swcu khoN sun lyhu sBY')).toBeGreaterThanOrEqual(0);
  });

  test(sheetCase('SRCH-03', 'Bhai Gurdaas Ji: "nsls" finds Nakh Sis Lo'), async ({ search }) => {
    await search.search('nsls');
    // The sheet asks that it appears; which position it takes has varied between builds.
    expect(await search.indexOfResult('nK isK lau sgl AMg')).toBeGreaterThanOrEqual(0);
  });

  test(
    sheetCase('SRCH-04', '"jh": shorter lines such as "jale hain" come first'),
    async ({ search }) => {
      await search.search('jh');
      const results = await search.searchResults();
      expect(results.length).toBeGreaterThan(3);
      expect(compact(results[0].gurmukhi)).toContain('jlyhYN');
      // Shorter lines first: the first result is no longer than the fifth.
      expect(results[0].gurmukhi.length).toBeLessThanOrEqual(results[4].gurmukhi.length);
    },
  );

  test(
    sheetCase('SRCH-05', 'The same searches work with the other Gurmukhi methods'),
    async ({ search }) => {
      await search.selectSearchType('First Letter (Anywhere)');
      await search.search('qnjqnh');
      expect(await search.indexOfResult('qIriQ nwvx jwau')).toBeGreaterThanOrEqual(0);
      await search.selectSearchType('Full Word(s)');
      await search.search('qIriQ nwvx');
      expect(await search.indexOfResult('qIriQ nwvx jwau')).toBeGreaterThanOrEqual(0);
      await search.selectSearchType('First Letter (Start)');
      await search.search('Kmrh');
      expect(await search.indexOfResult('^wlsw myro rUp hY ^ws')).toBe(0);
    },
  );

  test(
    sheetCase('SRCH-06', 'English search finds lines by their translation'),
    async ({ search }) => {
      await search.selectLanguage('en');
      // English offers Full Word(s) and First Letter (Anywhere).
      await search.selectSearchType('Full Word(s)');
      await search.search('pilgrimage');
      const results = await search.searchResults();
      expect(results.length).toBeGreaterThan(0);
      // The English search shows each line's transliteration alongside.
      expect(results[0].translit.length).toBeGreaterThan(0);
      await search.selectSearchType('First Letter (Anywhere)');
      await search.search('tnj');
      expect((await search.searchResults()).length).toBeGreaterThan(0);
    },
  );

  test(sheetCase('SRCH-09', 'Ang 917 opens Anand Sahib'), async ({ search }) => {
    await search.search('917');
    const results = await search.searchResults();
    expect(results.length).toBeGreaterThan(5);
    expect(await search.indexOfResult('rwmklI mhlw 3 Anµdu')).toBe(0);
    expect(await search.indexOfResult('Anµdu BieAw myrI mwey')).toBeGreaterThanOrEqual(0);
  });

  test(
    sheetCase('SRCH-10', 'The writer, raag and source filters narrow the results'),
    async ({ main, search }) => {
      await search.search('qnjqnh');
      const before = (await search.searchResults()).length;
      expect(before).toBeGreaterThan(0);
      // Dasam Granth only: the line is from the Guru Granth Sahib, so it goes.
      await main.locator('#dropdown-Source').selectOption('D');
      await expect(main.locator('.filter-tag--container .filter-tag')).toHaveCount(1);
      await expect
        .poll(async () => (await search.searchResults()).length, { timeout: 10000 })
        .toBeLessThan(before);
      await main.locator('.filter-tag--container .filter-tag--remove').first().click();
      await expect(main.locator('.filter-tag--container')).toBeHidden();
      await expect
        .poll(async () => (await search.searchResults()).length, { timeout: 10000 })
        .toBe(before);
    },
  );

  test(sheetCase('SRCH-11', '"Kmrh" finds Khalsa mero roop hai khaas'), async ({ search }) => {
    await search.search('Kmrh');
    expect(await search.indexOfResult('^wlsw myro rUp hY ^ws')).toBe(0);
  });

  test(sheetCase('SRCH-07', 'The * wildcard works'), async ({ search }) => {
    await search.search('qn*');
    const results = await search.searchResults();
    expect(results.length).toBeGreaterThan(0);
    // Every match still begins with the typed first letters.
    results.slice(0, 5).forEach((result) => {
      expect(firstLetters(result.gurmukhi)).toMatch(/^qn/);
    });
  });

  test(
    sheetCase('SRCH-08', 'The on-screen keyboard opens from its icon'),
    async ({ main, search }) => {
      await search.page.locator('.input-buttons .icon-button .fa-keyboard-o').click();
      await expect(main.locator('.gurmukhi-keyboard')).toBeVisible();
    },
  );
});
