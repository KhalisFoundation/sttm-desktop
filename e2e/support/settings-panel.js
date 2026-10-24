// The Settings overlay (toolbar → Settings): one long page of rows keyed by
// their setting id (www/configs/user-settings.json), each a switch, checkbox,
// range or select, with the theme picker alongside.
const { expect } = require('@playwright/test');

// The checkbox ids are built from the settings' titles (www/configs/user-settings.json).
const SETTING_TITLES = {
  'content1-visibility': 'TRANSLATION_VISIBILITY',
  'content2-visibility': 'TEEKA_VISIBILITY',
  'content3-visibility': 'TRANSLITERATION_VISIBILITY',
};

class SettingsPanel {
  constructor(page) {
    this.page = page;
  }

  get root() {
    return this.page.locator('.settings-wrapper');
  }

  async open() {
    if (await this.root.isVisible()) return;
    await this.page.locator('#tool-settings').click();
    await expect(this.root).toBeVisible();
  }

  async close() {
    if (!(await this.root.isVisible())) return;
    // The toolbar item toggles the overlay; the X is the fallback when the
    // toggle state has drifted (another overlay opened in between).
    await this.page.locator('#tool-settings').click();
    try {
      await expect(this.root).toBeHidden({ timeout: 2000 });
      return;
    } catch {
      // fall through
    }
    await this.page.locator('.backdrop:not(.d-none) .close-screen').last().click();
    await expect(this.root).toBeHidden();
  }

  row(settingId) {
    return this.root.locator(`.control-item#${settingId}`);
  }

  /** Scrolls the row into the middle of the panel. */
  async reveal(settingId) {
    const row = this.row(settingId);
    await expect(row).toHaveCount(1);
    await row.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    return row;
  }

  switchOf(settingId) {
    return this.row(settingId).locator('.switch input[type="checkbox"]');
  }

  async isOn(settingId) {
    await this.reveal(settingId);
    return this.switchOf(settingId).isChecked();
  }

  /** Sets a switch, clicking only when it differs. */
  async toggle(settingId, on) {
    await this.reveal(settingId);
    const input = this.switchOf(settingId);
    if ((await input.isChecked()) !== on) {
      await this.row(settingId).locator('.switch label').click();
    }
    await expect(input).toBeChecked({ checked: on });
  }

  /**
   * The "field to display" checkboxes (the eye beside each content line). They
   * sit in the line's font-size row as `#<setting>-checkbox`.
   */
  checkbox(settingId) {
    return this.root.locator(`#${SETTING_TITLES[settingId]}-checkbox`);
  }

  async check(settingId, on) {
    await this.reveal(settingId.replace('-visibility', '-font-size'));
    const input = this.checkbox(settingId);
    if ((await input.isChecked()) !== on) {
      await this.root
        .locator(`label[for="${SETTING_TITLES[settingId]}-checkbox"]`)
        .click({ force: true });
    }
    await expect(input).toBeChecked({ checked: on });
  }

  /** Sets a range slider, as a reader dragging it would. */
  async range(settingId, value) {
    await this.reveal(settingId);
    const input = this.row(settingId).locator('input[type="range"]');
    await input.evaluate((element, next) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(element, String(next));
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    await expect(this.row(settingId).locator('.range-value')).toHaveText(String(value));
  }

  async select(settingId, value) {
    await this.reveal(settingId);
    const select = this.row(settingId).locator('select');
    await select.selectOption(value);
    await expect(select).toHaveValue(value);
  }

  /** The built-in theme tiles (not the custom-background ones). */
  get themeTiles() {
    return this.root.locator(
      '.themes-container .theme-instance, .themes-container .video-theme-instance',
    );
  }

  themeTile(label) {
    return this.themeTiles.filter({ hasText: label }).first();
  }
}

module.exports = { SettingsPanel };
