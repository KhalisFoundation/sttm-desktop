const { expect, test } = require('../support/launch-app');
const { letters } = require('../support/search-window');
const { sheetCase } = require('../support/sheet');

test.describe('Additional options and history @fast', () => {
  test(sheetCase('MISC-01', 'Random Shabad opens a shabad'), async ({ search, viewer }) => {
    await search.openMiscTab('Others');
    await search.otherOption('Show Random Shabad').click();
    await expect
      .poll(async () => ((await viewer.text()) || '').trim().length, { timeout: 15000 })
      .toBeGreaterThan(10);
    await expect(search.page.locator('.shabad-pane .shabad-list').first()).toContainText(/\S/);
  });

  test(
    sheetCase('MISC-02', 'Daily Hukamnama shows the day’s shabad from BaniDB'),
    async ({ search, viewer, request }) => {
      // The same source the app reads, so the check is "shows what BaniDB says
      // today", not a date-bound fixture.
      const response = await request.get('https://api.banidb.com/v2/hukamnamas/today');
      expect(response.ok()).toBe(true);
      const today = await response.json();
      const firstLine =
        (((today.shabads[0] || {}).verses || [])[0] || { verse: {} }).verse.gurmukhi || '';
      expect(firstLine.length).toBeGreaterThan(0);
      await search.openMiscTab('Others');
      await search.otherOption('Daily Hukamnama').click();
      await viewer.expectText(firstLine, 30000);
    },
  );

  test(
    sheetCase('HIST-01', 'Shabads opened at random are added to history'),
    async ({ search }) => {
      await search.search('qnjqnh');
      await search.openResult(0);
      await search.search('Kmrh');
      await search.openResult(0);
      await search.openMiscTab('History');
      await expect(search.historyItems).toHaveCount(2);
    },
  );

  test(
    sheetCase('HIST-02', 'The history menu lists the opened shabads, newest first'),
    async ({ search }) => {
      await search.search('qnjqnh');
      await search.openResult(0);
      await search.search('Kmrh');
      await search.openResult(0);
      await search.openMiscTab('History');
      const labels = await search.historyItems.locator('.history-item').allInnerTexts();
      expect(labels).toHaveLength(2);
      expect(labels[0].replace(/\s/g, '')).toContain('^wlsw');
      expect(labels[1].replace(/\s/g, '')).toContain('qIriQ');
    },
  );

  test(sheetCase('HIST-03', 'A history entry opens its shabad'), async ({ search, viewer }) => {
    await search.search('qnjqnh');
    await search.openResult(0);
    await viewer.expectText(/qIriQ ?nwvx/);
    await search.search('Kmrh');
    await search.openResult(0);
    await viewer.expectText(/\^wlsw ?myro/);
    await search.openMiscTab('History');
    await search.historyItems.filter({ hasText: /qIriQ/ }).first().click();
    await viewer.expectText(/qIriQ ?nwvx/);
    expect(letters(await search.shabadPaneText())).toContain(letters('qIriQ nwvx'));
  });
});
