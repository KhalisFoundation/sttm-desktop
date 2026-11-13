const { expect, test } = require('../support/launch-app');
const { SettingsPanel } = require('../support/settings-panel');
const { sheetCase } = require('../support/sheet');

test.describe('Themes', () => {
  test.beforeEach(async ({ search, viewer }) => {
    await search.search('qnjqnh');
    await search.openResult(0);
    await viewer.expectText(/qIriQ ?nwvx/);
  });

  test(
    sheetCase('THEME-01', 'Every theme in the picker loads on the viewer'),
    async ({ main, viewer }, testInfo) => {
      const settings = new SettingsPanel(main);
      await settings.open();
      await expect(settings.themeTiles.first()).toBeVisible();
      const names = (await settings.themeTiles.allInnerTexts()).map((name) => name.trim());
      expect(names.length).toBeGreaterThanOrEqual(10);
      const looks = new Set();
      const themeClass = () =>
        viewer.run(
          "([...document.querySelector('.shabad-deck').classList].find((c) => c.startsWith('theme-')) || '')",
        );
      for (const name of names) {
        const tile = settings.themeTile(name);
        await tile.click();
        // The viewer takes the theme: its deck carries the theme class and its
        // background and text colour change with it.
        const key = (await tile.getAttribute('class')).match(
          /(?:^|\s)(?!extras-|ui-)(\S+)-tile(?:\s|$)/,
        )[1];
        const expected = `theme-${key}`;
        await expect.poll(themeClass, { timeout: 5000 }).toBe(expected);
        await main.waitForTimeout(300);
        const look = `${await viewer.style('.shabad-deck', 'background-color')} ${await viewer.style(
          '.shabad-deck',
          'background-image',
        )} ${await viewer.style('.slide-gurbani', 'color')}`;
        looks.add(look);
        await viewer.expectText(/qIriQ ?nwvx/);
        await testInfo.attach(`theme ${name}.png`, {
          body: await viewer.screenshot(),
          contentType: 'image/png',
        });
      }
      // Themes look different from one another (a few share a background).
      expect(looks.size).toBeGreaterThanOrEqual(Math.floor(names.length * 0.6));
    },
  );

  test(
    sheetCase('THEME-02', 'Custom backgrounds: the upload is offered and the picker is ready'),
    async ({ main }) => {
      // Partial: choosing a real image goes through the file picker and the
      // app's image checks, which stay with the tester. The control is checked.
      const settings = new SettingsPanel(main);
      await settings.open();
      const upload = settings.root.locator('#themebg-upload');
      await expect(upload).toHaveCount(1);
      await expect(upload).toHaveAttribute('accept', /image/);
      await expect(settings.root.locator('.file-input-label')).toBeVisible();
    },
  );
});
