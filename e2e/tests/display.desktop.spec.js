const fs = require('fs');
const path = require('path');

const { expect, stubFolderPicker, test } = require('../support/launch-app');
const { SettingsPanel } = require('../support/settings-panel');
const { sheetCase } = require('../support/sheet');

// A Gurmukhi word on the slide (each carries its own font size).
const GURBANI_WORD = '.slide-gurbani span[style]';
const GURBANI = '.slide-gurbani';

test.describe('Display options @fast', () => {
  test.beforeEach(async ({ search, viewer }) => {
    // A shabad on the viewer gives every option something to change.
    await search.search('qnjqnh');
    await search.openResult(0);
    await viewer.expectText(/qIriQ ?nwvx/);
  });

  test(
    sheetCase('DISP-01', 'Quick tools: font size adjustments change the slide'),
    async ({ viewer }) => {
      await viewer.openQuickTools();
      const before = parseFloat(await viewer.style(GURBANI_WORD, 'font-size'));
      expect(before).toBeGreaterThan(0);
      // The first row is the Gurbani; its "+" grows it.
      await viewer.click('.quicktool-item:first-child .fa-plus-circle');
      await expect
        .poll(async () => parseFloat(await viewer.style(GURBANI_WORD, 'font-size')))
        .toBeGreaterThan(before);
      await viewer.click('.quicktool-item:first-child .fa-minus-circle');
      await expect
        .poll(async () => parseFloat(await viewer.style(GURBANI_WORD, 'font-size')))
        .toBe(before);
    },
  );

  test(
    sheetCase('DISP-02', 'Quick tools: the content dropdown changes what a line shows'),
    async ({ viewer }) => {
      await viewer.openQuickTools();
      expect(await viewer.count('.quicktool-item select')).toBeGreaterThan(0);
      const before = (await viewer.text()) || '';
      const changed = await viewer.run(`(() => {
      const select = document.querySelector('.quicktool-item select');
      if (!select) return false;
      const other = [...select.options].find((option) => option.value !== select.value && !option.disabled);
      if (!other) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(select, other.value);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
      expect(changed).toBe(true);
      await expect.poll(async () => (await viewer.text()) || '').not.toBe(before);
    },
  );

  test(
    sheetCase('DISP-03', 'Quick tools: the visibility toggle hides a line'),
    async ({ viewer }) => {
      await viewer.openQuickTools();
      const lines = () => viewer.count('.slide-translation, .slide-teeka, .slide-transliteration');
      const before = await lines();
      expect(before).toBeGreaterThan(0);
      // The second row is the first content line; its eye hides it.
      await viewer.click('.quicktool-item:nth-child(2) .fa-eye');
      await expect.poll(lines, { timeout: 5000 }).toBe(before - 1);
      await viewer.click('.quicktool-item:nth-child(2) .fa-eye-slash');
      await expect.poll(lines, { timeout: 5000 }).toBe(before);
    },
  );

  test(
    sheetCase('DISP-04', 'Settings: each "field to display" toggle shows or hides its line'),
    async ({ main, viewer }) => {
      const settings = new SettingsPanel(main);
      await settings.open();
      const fields = ['content1-visibility', 'content2-visibility', 'content3-visibility'];
      const lines = () => viewer.count('.slide-translation, .slide-teeka, .slide-transliteration');
      const before = await lines();
      expect(before).toBeGreaterThan(0);
      // Hide every content line: only the Gurbani is left.
      for (const field of fields) {
        await settings.check(field, false);
      }
      await expect.poll(lines, { timeout: 5000 }).toBe(0);
      await viewer.expectText(/qIriQ ?nwvx/);
      // Show them again.
      for (const field of fields) {
        await settings.check(field, true);
      }
      await expect.poll(lines, { timeout: 5000 }).toBe(before);
    },
  );

  test(
    sheetCase('DISP-05', 'Settings: the font size sliders resize the slide'),
    async ({ main, viewer }) => {
      const settings = new SettingsPanel(main);
      await settings.open();
      await settings.range('gurbani-font-size', 14);
      await expect
        .poll(async () => parseFloat(await viewer.style(GURBANI_WORD, 'font-size')))
        .toBeGreaterThan(0);
      const large = parseFloat(await viewer.style(GURBANI_WORD, 'font-size'));
      await settings.range('gurbani-font-size', 6);
      await expect
        .poll(async () => parseFloat(await viewer.style(GURBANI_WORD, 'font-size')))
        .toBeLessThan(large);
      // The other sliders move their own line.
      await settings.range('content1-font-size', 8);
      await expect(settings.row('content1-font-size').locator('.range-value')).toHaveText('8');
    },
  );

  test(
    sheetCase('DISP-06', 'Settings: Akhand Paatth view and Auto Play'),
    async ({ main, viewer }) => {
      const settings = new SettingsPanel(main);
      await settings.open();
      const singleLine = await viewer.count(GURBANI);
      await settings.toggle('akhandpatt', true);
      await expect
        .poll(() => viewer.count(GURBANI), { timeout: 10000 })
        .toBeGreaterThan(singleLine);
      await settings.toggle('akhandpatt', false);
      await expect.poll(() => viewer.count(GURBANI), { timeout: 10000 }).toBe(singleLine);
      const line = await viewer.currentLineId();
      await settings.range('autoplay-delay', 1);
      await settings.toggle('autoplay-toggle', true);
      await expect.poll(() => viewer.currentLineId(), { timeout: 20000 }).not.toBe(line);
      await settings.toggle('autoplay-toggle', false);
    },
  );

  test(sheetCase('DISP-07', 'Settings: Larivaar joins the words'), async ({ main, viewer }) => {
    const settings = new SettingsPanel(main);
    await settings.open();
    expect(await viewer.count(`${GURBANI} .padchhed`)).toBe(1);
    await settings.toggle('larivaar', true);
    await expect.poll(() => viewer.count(`${GURBANI} .larivaar`)).toBe(1);
    await settings.toggle('larivaar', false);
    await expect.poll(() => viewer.count(`${GURBANI} .padchhed`)).toBe(1);
  });

  test(
    sheetCase('DISP-08', 'Settings: Left-align moves the slide text'),
    async ({ main, viewer }) => {
      const settings = new SettingsPanel(main);
      await settings.open();
      await settings.toggle('left-align', true);
      await expect.poll(() => viewer.classes('.verse-slide')).toContain('slide-left-align');
      await expect.poll(() => viewer.style('.verse-slide', 'text-align')).toMatch(/left|start/);
      await settings.toggle('left-align', false);
      await expect.poll(() => viewer.classes('.verse-slide')).not.toContain('slide-left-align');
    },
  );

  test(
    sheetCase('DISP-09', 'Settings: Live Feed lets a folder be chosen and writes the text files'),
    async ({ app, main, search }, testInfo) => {
      // Partial: the folder picker is a native dialog, so it is answered for
      // the test with a folder of its own; the files it then writes are checked.
      const folder = testInfo.outputPath('live-feed');
      fs.mkdirSync(folder, { recursive: true });
      await stubFolderPicker(app, folder);
      const files = ['sttm-Gurbani.txt', 'sttm-English.txt'].map((name) => path.join(folder, name));
      const settings = new SettingsPanel(main);
      await settings.open();
      await settings.toggle('live-feed', true);
      await settings.close();
      await search.shortcut('ArrowDown');
      await expect
        .poll(() => files.every((file) => fs.existsSync(file)), { timeout: 10000 })
        .toBe(true);
      expect(fs.readFileSync(files[0], 'utf8').trim().length).toBeGreaterThan(0);
    },
  );

  test(sheetCase('DISP-10', 'Settings: Vishraams colour the pauses'), async ({ main, viewer }) => {
    const settings = new SettingsPanel(main);
    await settings.open();
    const wordClasses = () =>
      viewer.run(
        "[...document.querySelectorAll('.slide-gurbani span[style]')].map((w) => w.className).join('|')",
      );
    await settings.toggle('display-vishraams', true);
    await expect.poll(wordClasses).toMatch(/vishraam/i);
    const coloured = await wordClasses();
    await settings.toggle('display-vishraams', false);
    await expect.poll(wordClasses).not.toBe(coloured);
  });

  test(
    sheetCase('DISP-11', 'Settings: Intelligent spacebar can be switched and stays switched'),
    async ({ main }) => {
      // Partial: the setting is exercised; what the spacebar then does on a
      // projector is judged by the tester.
      const settings = new SettingsPanel(main);
      await settings.open();
      const initial = await settings.isOn('intelligent-spacebar');
      await settings.toggle('intelligent-spacebar', !initial);
      await settings.close();
      await settings.open();
      expect(await settings.isOn('intelligent-spacebar')).toBe(!initial);
      await settings.toggle('intelligent-spacebar', initial);
    },
  );
});
