const { expect, test } = require('../support/launch-app');
const { SettingsPanel } = require('../support/settings-panel');
const { sheetCase } = require('../support/sheet');

// The sync code comes from the sync server (/sync/begin). A build run with
// NODE_ENV=development talks to the staging API, which may not hand one out;
// the tests that need a code skip when none arrives.
async function syncCode(main, search) {
  await search.toolbarItem('Bani Controller').click();
  const card = main.locator('.sync-wrapper').filter({ visible: true });
  await expect(card).toBeVisible();
  // The card shows a loader until the sync server answers, then the code.
  const code = card.locator('.sync-code-num');
  try {
    await expect(code).toBeVisible({ timeout: 20000 });
    await expect(code).not.toHaveText(/^\s*\.\.\.\s*$/, { timeout: 20000 });
  } catch {
    return null;
  }
  const text = ((await code.textContent()) || '').trim();
  return text === '...' ? null : text;
}

test.describe('Sync', () => {
  test(
    sheetCase('SYNC-01', 'The sync card shows the code and the PIN'),
    async ({ main, search }) => {
      const code = await syncCode(main, search);
      test.skip(code === null, 'the sync server gave no code (staging API in development builds)');
      expect(code).toMatch(/^[A-Z0-9-]{3,}$/);
      await expect(main.locator('.sync-wrapper').filter({ visible: true })).toContainText(
        /Pin:\s*\d{4}/,
      );
      await expect(main.locator('.sync-wrapper canvas').first()).toBeVisible();
    },
  );

  test(
    sheetCase('SYNC-02', 'The controller icon stays visible in the dark and light themes'),
    async ({ main }) => {
      // Visible = the icon's area shows something against what it sits on.
      const icon = main.locator('#tool-sync-button');
      const visibleIcon = () =>
        icon.evaluate((el) => {
          const style = getComputedStyle(el);
          return (
            style.backgroundImage !== 'none' || style.maskImage !== 'none' || el.children.length > 0
          );
        });
      const settings = new SettingsPanel(main);
      await settings.open();
      await settings.themeTile('Dark').click();
      await settings.close();
      await expect(icon).toBeVisible();
      expect(await visibleIcon()).toBe(true);
      await settings.open();
      await settings.themeTile('Light').click();
      await settings.close();
      await expect(icon).toBeVisible();
      expect(await visibleIcon()).toBe(true);
    },
  );

  test(
    sheetCase('SYNC-03', 'Present Code to Sangat shows the code on the viewer'),
    async ({ main, search, viewer }) => {
      const code = await syncCode(main, search);
      test.skip(code === null, 'the sync server gave no code (staging API in development builds)');
      await main.locator('.sync-wrapper .copy-code-btn').filter({ visible: true }).click();
      await viewer.expectText(code);
    },
  );

  test(sheetCase('SYNC-09', 'Stop session ends the sync'), async ({ main, search }) => {
    const code = await syncCode(main, search);
    test.skip(code === null, 'the sync server gave no code (staging API in development builds)');
    // "Disable all the remote connections" ends the session.
    await main
      .locator('.connection-switch-container .switch label')
      .filter({ visible: true })
      .click();
    await expect(
      main.locator('.sync-wrapper .sync-code-num').filter({ visible: true }),
    ).not.toHaveText(code, { timeout: 10000 });
  });
});
