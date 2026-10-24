const { expect, test } = require('../support/launch-app');
const { sheetCase } = require('../support/sheet');

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

// The footer's switches, in order: search, history, shabad, favourites, other.
const tab = (main, index) => main.locator('.single-display-switches button').nth(index);

test.describe('Single display mode', () => {
  test.beforeEach(async ({ search, main }) => {
    await search.switchWorkspace('Single-Display');
    await expect(main.locator('.single-display-pane')).toBeVisible();
  });

  test(
    sheetCase('SINGLE-01', 'A searched shabad fits the viewer, nothing cut off'),
    async ({ main, search, viewer }) => {
      await tab(main, 0).click();
      await search.search('qnjqnh');
      await search.openResult(0);
      await viewer.expectText(/qIriQ ?nwvx/);
      // Every slide element lies inside the viewer and does not overflow it.
      const overflow = await viewer.run(`(() => {
      const root = document.documentElement;
      const nodes = [...document.querySelectorAll('.verse-slide, .verse-slide > *')];
      let clipped = 0;
      nodes.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0) return;
        if (r.left < -1 || r.top < -1 || r.right > root.clientWidth + 1 || r.bottom > root.clientHeight + 1) clipped++;
        if (el.scrollWidth > el.clientWidth + 1) clipped++;
      });
      return { clipped, checked: nodes.length };
    })()`);
      expect((overflow || {}).checked || 0).toBeGreaterThan(0);
      expect((overflow || {}).clipped).toBe(0);
    },
  );

  test(
    sheetCase('SINGLE-02', 'Search, shortcuts and history work in single display'),
    async ({ main, search, viewer }) => {
      await tab(main, 0).click();
      await search.search('qnjqnh');
      await search.openResult(0);
      await viewer.expectText(/qIriQ ?nwvx/);
      await search.shortcut(`${MOD}+Digit1`);
      await viewer.expectText('vwihgurU');
      await search.shortcut(`${MOD}+Digit2`);
      await viewer.expectText('<> siq nwmu krqw purKu');
      await search.shortcut(`${MOD}+Digit3`);
      await viewer.expectBlank();
      // A second shabad, then the first again from history (the second switch).
      await tab(main, 0).click();
      await search.search('Kmrh');
      await search.openResult(0);
      await viewer.expectText(/\^wlsw ?myro/);
      await tab(main, 1).click();
      await expect(search.historyItems).toHaveCount(2);
      await search.historyItems.filter({ hasText: /qIriQ/ }).first().click();
      await viewer.expectText(/qIriQ ?nwvx/);
    },
  );
});
