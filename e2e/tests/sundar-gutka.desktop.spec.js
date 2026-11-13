const { closeApp, expect, launchApp, test } = require('../support/launch-app');
const { SearchWindow } = require('../support/search-window');
const { ViewerWindow } = require('../support/viewer-window');
const { sheetCase } = require('../support/sheet');

/**
 * How long the bani in the pane is. The list is virtualised (only the visible
 * rows exist), so the scroll height of the whole list stands in for its length.
 */
async function paneLength(main) {
  const scroller = main.locator('.shabad-list [data-testid="virtuoso-scroller"]').first();
  await expect(scroller).toBeVisible();
  await expect.poll(() => scroller.evaluate((el) => el.scrollHeight)).toBeGreaterThan(200);
  await main.waitForTimeout(500);
  return scroller.evaluate((el) => el.scrollHeight);
}

/** Steps through the deck and counts the distinct lines, up to `limit` presses. */
async function deckLength(search, viewer, limit) {
  const seen = new Set([await viewer.currentLineId()]);
  for (let i = 0; i < limit; i++) {
    const before = await viewer.currentLineId();
    await search.shortcut('ArrowDown');
    try {
      await expect.poll(() => viewer.currentLineId(), { timeout: 1500 }).not.toBe(before);
    } catch {
      break; // the end of the bani: the line no longer changes
    }
    seen.add(await viewer.currentLineId());
  }
  return seen.size;
}

/** Opens the Sundar Gutka and returns its bani rows (names in English, for matching). */
async function openSundarGutka(main, search) {
  const rows = main.locator('#sundar-gutka-banis li');
  // From another overlay the first click may only close that overlay.
  for (let attempt = 0; attempt < 2; attempt++) {
    await search.toolbarItem('Sundar Gutka').click();
    try {
      await expect(rows.first()).toBeVisible({ timeout: 5000 });
      break;
    } catch {
      // try again
    }
  }
  await expect(rows.first()).toBeVisible({ timeout: 20000 });
  const english = main.locator('#translate-eng');
  if (!(await english.isChecked())) await main.locator('label[for="translate-eng"]').click();
  await expect(english).toBeChecked();
  return rows;
}

test.describe('Sundar Gutka and Ceremonies', () => {
  test(
    sheetCase('SG-01', 'The Sundar Gutka lists the banis and opens them'),
    async ({ main, search, viewer }) => {
      const rows = await openSundarGutka(main, search);
      expect(await rows.count()).toBeGreaterThan(40);
      // The names switch between Gurmukhi and English with the toggle.
      await expect(rows.filter({ hasText: /japujee/i }).first()).toBeVisible();
      await main.locator('label[for="translate-eng"]').click();
      await expect(rows.filter({ hasText: 'jpujI' }).first()).toBeVisible();
      await rows.filter({ hasText: 'jpujI' }).first().click();
      await viewer.expectText('<> siq nwmu krqw purKu', 20000);
      await expect(main.locator('.shabad-pane .shabad-list').first()).toContainText(/\S/);
      expect(await deckLength(search, viewer, 60)).toBeGreaterThan(30);
      expect(await paneLength(main)).toBeGreaterThan(1000);
    },
  );

  test(sheetCase('SG-02', 'Rehras Sahib has short, medium and long versions'), async () => {
    // Bani Length is read when a bani opens, so each length gets its own app,
    // started with that setting.
    const counts = {};
    for (const length of ['short', 'medium', 'long']) {
      const launched = await launchApp({ settings: { 'bani-length': length } });
      try {
        const { main } = launched;
        const search = new SearchWindow(main);
        const viewer = new ViewerWindow(launched.app);
        const rows = await openSundarGutka(main, search);
        await rows
          .filter({ hasText: /rahar|rehr/i })
          .first()
          .click();
        await viewer.expectText(/\S/, 20000);
        counts[length] = await paneLength(main);
      } finally {
        await closeApp(launched);
      }
    }
    expect(counts.short).toBeGreaterThan(1000);
    expect(counts.medium).toBeGreaterThanOrEqual(counts.short);
    expect(counts.long).toBeGreaterThan(counts.short);
  });

  test(
    sheetCase('SG-03', 'The Anand Karaj ceremony runs through its whole deck'),
    async ({ main, search, viewer }) => {
      await search.toolbarItem('Ceremonies').click();
      const pane = main.locator('.ceremony-pane#anandkaraj');
      await expect(pane).toBeVisible({ timeout: 20000 });
      await pane.locator('.ceremony-pane-themes .theme-instance').first().click();
      await viewer.expectText(/\S/, 20000);
      const seen = new Set([await viewer.currentLineId()]);
      // Step through the deck; every press should move to a new line until the end.
      for (let i = 0; i < 40; i++) {
        await search.shortcut('ArrowDown');
        await main.waitForTimeout(150);
        seen.add(await viewer.currentLineId());
      }
      expect(seen.size).toBeGreaterThan(20);
      await viewer.expectText(/\S/);
      expect(main.isClosed()).toBe(false);
    },
  );
});
