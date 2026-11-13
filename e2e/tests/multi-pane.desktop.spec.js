const { expect, test } = require('../support/launch-app');
const { compact } = require('../support/search-window');
const { sheetCase } = require('../support/sheet');

const pane = (main, id) => main.locator(`.multipane-grid .shabad${id}-container`);
const paneList = (main, id) => pane(main, id).locator('.shabad-list');
const paneHeader = (main, id) => pane(main, id).locator('.shabad-pane-header');
const lockButton = (main, id) => paneHeader(main, id).locator('.pane-info button');
const contentSelect = (main, id) => paneHeader(main, id).locator('select.pane-options-dropdown');

/** Searches and sends the first result to a pane with the result's pane button. */
async function openInPane(search, query, id) {
  await search.search(query);
  const result = search.results.first();
  const list = search.page.locator(`.multipane-grid .shabad${id}-container .shabad-list`);
  // The list re-renders while results settle, so the click is repeated until
  // the pane has the shabad.
  for (let attempt = 0; attempt < 3; attempt++) {
    await result.locator(`.button-pane-${id}`).click({ force: true });
    try {
      await expect(list).toContainText(/\S/, { timeout: 3000 });
      return;
    } catch {
      // try again
    }
  }
  await expect(list).toContainText(/\S/);
}

/** Opens the Sundar Gutka and picks `bani` (an English name) for `paneId`. */
async function openBaniInPane(main, search, bani, paneId) {
  await search.toolbarItem('Sundar Gutka').click();
  const rows = main.locator('#sundar-gutka-banis li');
  await expect(rows.first()).toBeVisible({ timeout: 20000 });
  if (!(await main.locator('#translate-eng').isChecked())) {
    await main.locator('label[for="translate-eng"]').click();
  }
  await rows.filter({ hasText: bani }).first().click();
  await main.locator(`.multipane-dropdown.enabled .option-pane-${paneId}`).click();
}

const QUERIES = {
  1: { query: 'qnjqnh', line: 'qIriQ nwvx' },
  2: { query: 'Kmrh', line: '^wlsw myro' },
  3: { query: 'sksls', line: 'swcu khoN' },
};

test.describe('Multi-pane', () => {
  test.beforeEach(async ({ search, main }) => {
    await search.switchWorkspace('Multi-Pane');
    await expect(main.locator('.multipane-grid')).toBeVisible();
  });

  test(sheetCase('MULTI-01', 'Three shabads show in the three panes'), async ({ main, search }) => {
    for (const id of [1, 2, 3]) {
      await openInPane(search, QUERIES[id].query, id);
      await expect(paneList(main, id)).toContainText(QUERIES[id].line.split(' ')[0]);
    }
    for (const id of [1, 2, 3]) {
      expect(compact(await paneList(main, id).innerText())).toContain(compact(QUERIES[id].line));
    }
  });

  test(
    sheetCase('MULTI-02', 'Switching panes shows that pane on the viewer'),
    async ({ main, search, viewer }) => {
      await openInPane(search, 'qnjqnh', 1);
      await openInPane(search, 'Kmrh', 2);
      const verse = (id, text) =>
        paneList(main, id).locator('.verse-content').filter({ hasText: text }).first();
      await verse(1, /qIriQ/).click();
      await viewer.expectText(/qIriQ ?nwvx/);
      await verse(2, /\^wlsw/).click();
      await viewer.expectText(/\^wlsw ?myro/);
      await verse(1, /qIriQ/).click();
      await viewer.expectText(/qIriQ ?nwvx/);
    },
  );

  test(sheetCase('MULTI-03', 'A locked pane refuses a bani'), async ({ main, search }) => {
    await openInPane(search, 'qnjqnh', 2);
    await lockButton(main, 2).click();
    await expect(lockButton(main, 2).locator('.fa-lock')).toBeVisible();
    // A result can no longer be sent to pane 2.
    await search.search('Kmrh');
    const result = search.results.first();
    await expect(result.locator('.button-pane-2')).toBeDisabled();
    await expect(result.locator('.button-pane-1')).toBeEnabled();
    // Nor a Sundar Gutka bani: its pane picker marks pane 2 locked and ignores the click.
    await search.toolbarItem('Sundar Gutka').click();
    const rows = main.locator('#sundar-gutka-banis li');
    await expect(rows.first()).toBeVisible({ timeout: 20000 });
    await rows.first().click();
    const paneTwo = main.locator('.multipane-dropdown.enabled .option-pane-2');
    await expect(paneTwo).toHaveClass(/locked-option/);
    await paneTwo.click({ force: true });
    // The overlay closes with its button.
    await main.locator('.backdrop .close-screen').first().click();
    await expect(main.locator('#sundar-gutka-banis')).toBeHidden();
    expect(compact(await paneList(main, 2).innerText())).toContain(compact('qIriQ nwvx'));
    await lockButton(main, 2).click();
  });

  test(
    sheetCase('MULTI-04', 'Three Sundar Gutka banis open in the three panes'),
    async ({ main, search }) => {
      const banis = { 1: /japujee/i, 2: /^\s*jaap saahib/i, 3: /ana\(n\)dh/i };
      for (const id of [1, 2, 3]) {
        await openBaniInPane(main, search, banis[id], id);
        await expect(paneList(main, id)).toContainText(/\S/, { timeout: 20000 });
      }
      expect(compact(await paneList(main, 1).innerText())).toContain(compact('<> siq nwmu'));
      expect(compact(await paneList(main, 2).innerText())).toContain('jwpu');
      expect(compact(await paneList(main, 3).innerText())).toContain(
        compact('rwmklI mhlw 3 Anµdu'),
      );
    },
  );

  test(
    sheetCase('MULTI-05', 'A shabad opens from history inside a pane'),
    async ({ main, search }) => {
      await openInPane(search, 'qnjqnh', 1);
      await openInPane(search, 'Kmrh', 1);
      await contentSelect(main, 2).selectOption('History');
      const items = pane(main, 2).locator('.history-item-container');
      await expect(items).toHaveCount(2);
      await items.filter({ hasText: /qIriQ/ }).first().click();
      await expect(paneList(main, 2)).toContainText(/qIriQ/);
    },
  );

  test(
    sheetCase('MULTI-06', 'Banis, ceremonies and shabads mix across the panes'),
    async ({ main, search }) => {
      await openInPane(search, 'qnjqnh', 1);
      await openBaniInPane(main, search, /japujee/i, 2);
      await search.toolbarItem('Ceremonies').click();
      const ceremony = main.locator('.ceremony-pane#anandkaraj');
      await expect(ceremony).toBeVisible({ timeout: 20000 });
      await ceremony.locator('.ceremony-pane-themes .theme-instance').first().click();
      await main.locator('.multipane-dropdown.enabled .option-pane-3').click();
      await expect(paneList(main, 3)).toContainText(/\S/, { timeout: 20000 });
      expect(compact(await paneList(main, 1).innerText())).toContain(compact('qIriQ nwvx'));
      expect(compact(await paneList(main, 2).innerText())).toContain(compact('<> siq nwmu'));
      // The ceremony replaces the pane with the Anand Karaj deck.
      expect(compact(await paneList(main, 3).innerText())).not.toContain(compact('qIriQ nwvx'));
    },
  );

  test(
    sheetCase('MULTI-07', 'Asa di Vaar loads every time it is opened'),
    async ({ main, search }) => {
      for (let i = 0; i < 4; i++) {
        await search.toolbarItem('Sundar Gutka').click();
        await expect(main.locator('#sundar-gutka-banis li').first()).toBeVisible({
          timeout: 20000,
        });
        if (!(await main.locator('#translate-eng').isChecked())) {
          await main.locator('label[for="translate-eng"]').click();
        }
        const tile = main
          .locator('.popular-banis .ui-tile')
          .filter({ hasText: /aasaa dhee vaar/i });
        await expect(tile).toBeVisible({ timeout: 20000 });
        await tile.click();
        await main.locator('.multipane-dropdown.enabled .option-pane-1').click();
        await expect(paneList(main, 1)).toContainText(/Awsw/, { timeout: 30000 });
        const scroller = paneList(main, 1).locator('[data-testid="virtuoso-scroller"]');
        await expect
          .poll(() => scroller.evaluate((el) => el.scrollHeight), { timeout: 30000 })
          .toBeGreaterThan(5000);
      }
    },
  );

  test(sheetCase('MULTI-08', 'Clear pane empties a pane'), async ({ main, search }) => {
    await openInPane(search, 'qnjqnh', 1);
    await expect(paneList(main, 1)).toContainText(/qIriQ/);
    await paneHeader(main, 1).locator('.pane-tools button').filter({ hasText: 'Clear' }).click();
    await expect(pane(main, 1)).not.toContainText(/qIriQ/);
  });

  test(sheetCase('MULTI-09', 'Misc slides open from a pane'), async ({ main, search, viewer }) => {
    await openInPane(search, 'qnjqnh', 2);
    await contentSelect(main, 2).selectOption('Misc Slides');
    const rows = pane(main, 2).locator('.history-item-container');
    await rows.filter({ hasText: 'Mool Mantr' }).click();
    await viewer.expectText('<> siq nwmu krqw purKu');
    await rows.filter({ hasText: 'vwihgurU' }).click();
    await viewer.expectText('vwihgurU');
    await rows.filter({ hasText: 'Anand Sahib' }).click();
    await viewer.expectText(/rwmklI ?mhlw ?3 ?Anµdu/, 20000);
  });

  test(
    sheetCase('MULTI-10', 'A clicked result opens in the default pane'),
    async ({ main, search }) => {
      await search.search('qnjqnh');
      await search.openResult(0);
      await expect(paneList(main, 1)).toContainText(/qIriQ/);
      expect(compact(await paneList(main, 2).innerText())).not.toContain('qIriQ');
    },
  );

  test(
    sheetCase(
      'MULTI-11',
      'Changing the default pane in the search footer changes where results open',
    ),
    async ({ main, search }) => {
      await main.locator('.default-pane-switcher .pane-3-btn').click();
      await expect(main.locator('.default-pane-switcher .pane-3-btn')).toHaveClass(/active/);
      await search.search('Kmrh');
      await search.openResult(0);
      await expect(paneList(main, 3)).toContainText(/\^wlsw/);
      expect(compact(await paneList(main, 1).innerText())).not.toContain('^wlsw');
    },
  );

  test(
    sheetCase('MULTI-12', 'A different shabad is favourited in each pane'),
    async ({ main, search, signIn }) => {
      test.skip(
        !process.env.STTM_E2E_USER_TOKEN,
        'needs STTM_E2E_USER_TOKEN (a Khalis account token)',
      );
      await signIn();
      for (const id of [1, 2, 3]) {
        await openInPane(search, QUERIES[id].query, id);
        const star = paneHeader(main, id).locator('.fav-btn');
        await expect(star).toBeVisible();
        if (!(await star.getAttribute('class')).includes('unfav-btn')) await star.click();
        await expect(star).toHaveClass(/unfav-btn/);
      }
      await contentSelect(main, 1).selectOption('Favorite Shabads');
      await expect(pane(main, 1).locator('.fav-shabad-container')).toHaveCount(3, {
        timeout: 15000,
      });
      for (const id of [1, 2, 3]) {
        await paneHeader(main, id).locator('.fav-btn').click();
      }
    },
  );
});
