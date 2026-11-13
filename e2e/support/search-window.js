// The main window: the search pane (bar, filters, results), the shabad pane,
// the misc pane (History / Favorites / Others and the shortcut tray), the
// workspace bar and the toolbar.
const { expect } = require('@playwright/test');

/** Letters only, lower-cased: "Teerath Naavan Jao" and "teerath naavan jaau" compare equal. */
const letters = (text) => text.toLowerCase().replace(/[^a-z]/g, '');

/** The line without spaces or verse markers, for comparing Gurmukhi ASCII text. */
const compact = (text) => text.replace(/[\s\]।॥]/g, '');

/**
 * The first letter of each word of a Gurmukhi ASCII line, as first-letter
 * search sees it: the sihari ("i") is written before its consonant and is
 * skipped, as are leading punctuation marks.
 */
const firstLetters = (text) =>
  text
    .split(/\s+/)
    .filter((word) => /[a-zA-Z<>^]/.test(word))
    .map((word) => word.replace(/^[i\W_]+/, '')[0] || '')
    .join('');

// The toolbar's items, by the id suffix the app gives them.
const TOOLBAR = {
  'Sundar Gutka': 'sunder-gutka',
  Ceremonies: 'ceremonies',
  Announcement: 'announcement',
  'Bani Controller': 'sync-button',
  'Lock Screen': 'lock-screen',
  Login: 'auth-dialog',
  Settings: 'settings',
};

class SearchWindow {
  constructor(page) {
    this.page = page;
    this.input = page.locator('input.input-box');
    this.results = page.locator('li.search-li');
  }

  /** Types a query and waits for its results (not the previous query's). */
  async search(query) {
    await this.input.fill('');
    // An empty query clears the list, so the next results are definitely new.
    await expect(this.results)
      .toHaveCount(0, { timeout: 5000 })
      .catch(() => undefined);
    await this.input.fill(query);
    await expect(this.results.first()).toBeVisible({ timeout: 15000 });
    await this.page.waitForTimeout(500);
  }

  /**
   * The rendered results (the list is virtualised, so these are the visible
   * rows): the Gurmukhi line in the ASCII font encoding, and anvaad's
   * transliteration when the English search is on.
   */
  async searchResults() {
    return this.results.evaluateAll((items) =>
      items.map((item) => {
        // The Gurmukhi is rendered word by word (for highlighting).
        const words = Array.from(item.querySelectorAll('.bani-words')).map((word) =>
          (word.textContent || '').trim(),
        );
        const line = item.querySelector('.panktee .gurmukhi');
        return {
          gurmukhi: words.length ? words.join(' ') : ((line && line.textContent) || '').trim(),
          translit: ((item.querySelector('.eng-verse') || {}).textContent || '').toLowerCase(),
        };
      }),
    );
  }

  /** Index of the first result whose Gurmukhi (ASCII font text) contains `text`, or -1. */
  async indexOfResult(text) {
    const results = await this.searchResults();
    return results.findIndex((result) => compact(result.gurmukhi).includes(compact(text)));
  }

  async openResult(index = 0) {
    await this.results.nth(index).locator('.search-list').click();
  }

  /** The Gurmukhi / English choice above the search bar (styled radios, so the label is clicked). */
  async selectLanguage(language) {
    const name = language === 'en' ? 'english' : 'gurmukhi';
    await this.page.locator(`.language-selector label.${name}`).click();
    await expect(this.page.locator(`#${name}-language`)).toBeChecked();
  }

  /**
   * One of the search methods. The header shows them as radio buttons on a
   * wide window and as a dropdown on a narrow one.
   */
  async selectSearchType(label) {
    const dropdown = this.page.locator('.search-select select');
    if (await dropdown.count()) {
      await dropdown.selectOption({ label });
      return;
    }
    await this.page.locator('.search-type .search-type-label').filter({ hasText: label }).click();
  }

  /** A keyboard shortcut sent to the window, not to the search box. */
  async shortcut(keys) {
    await this.page
      .locator('body')
      .click({ position: { x: 5, y: 5 } })
      .catch(() => undefined);
    await this.input.blur().catch(() => undefined);
    await this.page.keyboard.press(keys);
  }

  /** A toolbar item (the icons down the left), by its title. */
  toolbarItem(title) {
    const id = TOOLBAR[title];
    if (!id) throw new Error(`No toolbar item called ${title}`);
    return this.page.locator(`#tool-${id}`);
  }

  /** The History / Favorites / Others tabs of the misc pane. */
  async openMiscTab(name) {
    await this.page.locator('.misc-header .misc-button').filter({ hasText: name }).click();
  }

  /** The entries of the Others tab (Show Random Shabad, Daily Hukamnama). */
  otherOption(name) {
    return this.page.locator('.list-of-items a').filter({ hasText: name }).first();
  }

  /** The history entries of whichever history list is on screen. */
  get historyItems() {
    return this.page.locator('.history-results .history-item-container').filter({ visible: true });
  }

  /** The shortcut tray under the misc pane (Anand Sahib, Mool Mantr, ਵਾਹਿਗੁਰੂ, [blank], …). */
  trayItem(label) {
    return this.page.locator('.shortcut-drawer .tray-item-icon').filter({ hasText: label }).first();
  }

  async switchWorkspace(name) {
    await this.page.locator('.workspace-bar .workspace-name').filter({ hasText: name }).click();
  }

  /** Text of the shabad pane that previews the current shabad. */
  async shabadPaneText() {
    return this.page
      .locator('.shabad-pane .shabad-list')
      .filter({ visible: true })
      .first()
      .innerText();
  }
}

module.exports = { SearchWindow, compact, firstLetters, letters };
