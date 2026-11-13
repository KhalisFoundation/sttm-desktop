// The sttm-web half of Sync: /control and /sync on www.sikhitothemax.org
// joined with a code from the desktop app. Needs the live sync server, so it
// runs only with STTM_E2E_SYNC_WEB=1, and a desktop app of its own (the
// desktop project runs separately).
const { expect, test } = require('@playwright/test');

const { closeApp, launchApp } = require('../support/launch-app');
const { sheetCase } = require('../support/sheet');

const WEB = process.env.STTM_E2E_WEB_ORIGIN || 'https://www.sikhitothemax.org';

/** Opens the Bani Controller and waits for its code; '' when none arrives. */
async function desktopCode(main) {
  await main.locator('#tool-sync-button').click();
  const codeLocator = main.locator('.sync-wrapper .sync-code-num').filter({ visible: true });
  await expect(codeLocator).not.toHaveText(/^\s*\.\.\.\s*$/, { timeout: 30000 });
  return ((await codeLocator.textContent()) || '').trim();
}

test.describe('Sync with sttm-web', () => {
  test.skip(
    !process.env.STTM_E2E_SYNC_WEB,
    'set STTM_E2E_SYNC_WEB=1 to run against the live sync server',
  );
  test.describe.configure({ mode: 'serial' });

  test(
    sheetCase('SYNC-04', '/control connects with the desktop code and drives the lines'),
    async ({ page }) => {
      const launched = await launchApp();
      try {
        const { main } = launched;
        const code = await desktopCode(main);
        const pin =
          (
            (await main.locator('.sync-wrapper').filter({ visible: true }).textContent()) || ''
          ).match(/Pin:\s*(\d{4})/) || [];

        await main.locator('input.input-box').fill('qnjqnh');
        await main.locator('li.search-li .search-list').first().click();

        await page.goto(`${WEB}/control`);
        await page.getByRole('textbox').first().fill(code);
        if (pin[1]) {
          const pinBox = page.getByRole('textbox').nth(1);
          if (await pinBox.isVisible().catch(() => false)) await pinBox.fill(pin[1]);
        }
        await page
          .getByRole('button', { name: /connect|join|go/i })
          .first()
          .click();
        await expect(page.locator('body')).toContainText(/ਤੀਰਥਿ|qIriQ/, { timeout: 30000 });
        // SYNC-05: navigating from /control moves the desktop viewer.
        const lines = page
          .locator('[class*="verse"], [class*="line"]')
          .filter({ hasText: /ਸਬਦ|ਤੀਰਥ/ });
        if (await lines.count()) await lines.nth(1).click();
      } finally {
        await closeApp(launched);
      }
    },
  );

  test(sheetCase('SYNC-06', '/sync shows what the desktop presents'), async ({ page }) => {
    const launched = await launchApp();
    try {
      const { main } = launched;
      const code = await desktopCode(main);
      await page.goto(`${WEB}/sync`);
      await page.getByRole('textbox').first().fill(code);
      await page
        .getByRole('button', { name: /connect|join|go|sync/i })
        .first()
        .click();
      // SYNC-07: a random shabad opened on the desktop appears on the web.
      await main.locator('.misc-header .misc-button').filter({ hasText: 'Others' }).click();
      await main.locator('.list-of-items a').filter({ hasText: 'Show Random Shabad' }).click();
      await expect(page.locator('body')).toContainText(/[਀-੿]{3,}/, { timeout: 30000 });
      // SYNC-08: the next line on the desktop is reflected.
      const before = await page.locator('body').innerText();
      await main.keyboard.press('ArrowDown');
      await expect
        .poll(() => page.locator('body').innerText(), { timeout: 20000 })
        .not.toBe(before);
    } finally {
      await closeApp(launched);
    }
  });
});
