const { expect, test } = require('../support/launch-app');
const { sheetCase } = require('../support/sheet');

// Signing in goes through the Khalis SSO in a browser, which cannot be
// scripted here, so these tests take a signed-in account's token from
// STTM_E2E_USER_TOKEN and hand it to the app the way the login deep link does.
test.describe('Login and favourites', () => {
  test.skip(!process.env.STTM_E2E_USER_TOKEN, 'needs STTM_E2E_USER_TOKEN (a Khalis account token)');

  test(
    sheetCase('FAV-01', 'The app accepts the account and offers Logout'),
    async ({ main, signIn }) => {
      // Partial: the SSO login page itself is the tester's step.
      await signIn();
      await expect(main.locator('#tool-auth-dialog')).toHaveAttribute('title', 'Logout', {
        timeout: 15000,
      });
    },
  );

  test(
    sheetCase('FAV-02', 'The favourites tab lists the saved shabads'),
    async ({ main, search, signIn }) => {
      await signIn();
      await search.openMiscTab('Favorites');
      const pane = main.locator('.fav-results').filter({ visible: true });
      await expect(pane).toBeVisible();
      await expect(pane.locator('.sttm-loader')).toBeHidden({ timeout: 15000 });
      await expect(pane.locator('.nologin .error')).toBeEmpty();
    },
  );

  test(
    sheetCase('FAV-03', 'A new favourite appears in the list'),
    async ({ main, search, signIn }) => {
      await signIn();
      await search.search('Kmrh');
      await search.openResult(0);
      const star = main.locator('.shabad-pane-header .fav-btn').first();
      await expect(star).toBeVisible({ timeout: 15000 });
      if ((await star.getAttribute('class')).includes('unfav-btn')) {
        await star.click();
        await expect(star).not.toHaveClass(/unfav-btn/, { timeout: 15000 });
      }
      await star.click();
      await expect(star).toHaveClass(/unfav-btn/, { timeout: 15000 });
      await search.openMiscTab('Favorites');
      await expect(
        main.locator('.fav-results .fav-shabad-container').filter({ hasText: /\^wlsw/ }),
      ).toHaveCount(1, { timeout: 15000 });
    },
  );

  test(
    sheetCase('FAV-04', 'An unfavourited shabad leaves the list'),
    async ({ main, search, signIn }) => {
      await signIn();
      await search.search('Kmrh');
      await search.openResult(0);
      const star = main.locator('.shabad-pane-header .fav-btn').first();
      await expect(star).toBeVisible({ timeout: 15000 });
      if (!(await star.getAttribute('class')).includes('unfav-btn')) {
        await star.click();
        await expect(star).toHaveClass(/unfav-btn/, { timeout: 15000 });
      }
      await star.click();
      await expect(star).not.toHaveClass(/unfav-btn/, { timeout: 15000 });
      await search.openMiscTab('Favorites');
      await expect(
        main.locator('.fav-results .fav-shabad-container').filter({ hasText: /\^wlsw/ }),
      ).toHaveCount(0, { timeout: 15000 });
    },
  );
});
