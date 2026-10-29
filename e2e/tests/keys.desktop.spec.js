const { expect, test, waitForWindow } = require('../support/launch-app');
const { sheetCase } = require('../support/sheet');

// Ctrl on Linux and Windows, Cmd on macOS, as the app binds them.
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe('Keyboard shortcuts @fast', () => {
  test(sheetCase('KEYS-01', 'Ctrl+/ focuses the search bar'), async ({ search, main }) => {
    await search.shortcut(`${MOD}+Slash`);
    await expect
      .poll(() => main.evaluate(() => (document.activeElement || {}).className || ''))
      .toContain('input-box');
  });

  test(sheetCase('KEYS-02', 'Ctrl+1 shows the Waheguru slide'), async ({ search, viewer }) => {
    await search.shortcut(`${MOD}+Digit1`);
    await viewer.expectText('vwihgurU');
  });

  test(sheetCase('KEYS-03', 'Ctrl+2 shows the Mool Mantar'), async ({ search, viewer }) => {
    await search.shortcut(`${MOD}+Digit2`);
    await viewer.expectText('<> siq nwmu krqw purKu');
  });

  test(sheetCase('KEYS-04', 'Ctrl+3 shows a blank slide'), async ({ search, viewer }) => {
    await search.shortcut(`${MOD}+Digit1`);
    await viewer.expectText('vwihgurU');
    await search.shortcut(`${MOD}+Digit3`);
    await viewer.expectBlank();
  });

  test(sheetCase('KEYS-05', 'Ctrl+4 opens Anand Sahib (Bhog)'), async ({ search, viewer }) => {
    await search.shortcut(`${MOD}+Digit4`);
    await viewer.expectText(/rwmklI ?mhlw ?3 ?Anµdu/, 20000);
  });

  test(sheetCase('KEYS-06', 'Ctrl+5 opens the help window'), async ({ search, app }) => {
    await search.shortcut(`${MOD}+Digit5`);
    const help = await waitForWindow(app, 'help.html', 15000);
    await expect(help).toHaveURL(/help\.html$/);
  });

  test(sheetCase('KEYS-07', 'Ctrl+6 opens the shortcut legend'), async ({ search, app }) => {
    await search.shortcut(`${MOD}+Digit6`);
    const legend = await waitForWindow(app, 'legend.html', 15000);
    await expect(legend).toHaveURL(/legend\.html$/);
  });

  test(sheetCase('KEYS-08', 'Ctrl+G opens Insert Dhan Slide'), async ({ search, main }) => {
    await search.shortcut(`${MOD}+KeyG`);
    const modal = main.locator('.tingle-modal--visible');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.modalTitle')).toContainText('Insert Dhan Slide');
    // The ten Gurus and Sri Guru Granth Sahib Ji.
    await expect(modal.locator('button.guru')).toHaveCount(11);
  });
});
