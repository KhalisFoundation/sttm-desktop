const { expect, test } = require('../support/launch-app');
const { sheetCase } = require('../support/sheet');

test.describe('Shortcut tray @fast', () => {
  test(
    sheetCase('TRAY-01', 'Every tray option does what it says'),
    async ({ main, search, viewer }) => {
      await expect(main.locator('.shortcut-drawer')).toBeVisible();
      await search.trayItem('Anand Sahib').click();
      await viewer.expectText(/rwmklI ?mhlw ?3 ?Anµdu/, 20000);
      await search.trayItem('Mool Mantr').click();
      await viewer.expectText('<> siq nwmu krqw purKu');
      await search.trayItem('vwihgurU').click();
      await viewer.expectText('vwihgurU');
      await search.trayItem('[blank]').click();
      await viewer.expectBlank();
      // Custom Image opens the file picker (a native dialog); the input is there.
      await expect(main.locator('.shortcut-drawer input[type="file"]')).toHaveCount(1);
      await search.trayItem('Announcement').click();
      await expect(main.locator('.announcement-body').first()).toBeVisible();
    },
  );

  test(sheetCase('TRAY-02', 'The tray minimises and opens again'), async ({ main }) => {
    const drawer = main.locator('.shortcut-drawer');
    await expect(drawer).toHaveClass(/shortcut-drawer-active/);
    await main.locator('.misc-footer .quick-tray').click();
    await expect(drawer).toHaveClass(/shortcut-drawer-inactive/);
    await main.locator('.misc-footer .quick-tray').click();
    await expect(drawer).toHaveClass(/shortcut-drawer-active/);
  });
});
