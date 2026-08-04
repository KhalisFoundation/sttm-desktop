/**
 * The Bani Controller phone app and the presenter remote drive the same viewer
 * settings as the local Quick Tools steppers, through `quick-tools-utils`.
 *
 * Font sizes are held separately for the slide view and Akhand Paatth, so a
 * remote stepper must update the view on screen. Updating the other setting
 * leaves the projector unchanged and changes the inactive view's size.
 */
const { changeFontSize, changeVisibility } = require('../../www/main/quick-tools-utils');
const { fontSizeSetting } = require('../../www/main/viewer/font-sizes');

const SIZED_SLOTS = ['gurbani', 'content1', 'content2', 'content3'];

let written;

const withSettings = (settings) => {
  written = [];
  global.getUserSettings = { ...settings };
  global.setUserSettings = new Proxy(
    {},
    {
      get: (_target, name) => (value) => written.push([name, value]),
      has: () => true,
    },
  );
};

describe('remote font-size control', () => {
  describe.each([
    ['the slide view', false],
    ['Akhand Paatth', true],
  ])('in %s', (_label, akhandpatt) => {
    it.each(SIZED_SLOTS)('steps %s up through the setting that view renders from', (slot) => {
      const { stateName, actionName } = fontSizeSetting(slot, akhandpatt);
      withSettings({ akhandpatt, [stateName]: 7 });
      changeFontSize(slot, true);
      expect(written).toEqual([[actionName, 8]]);
    });

    it.each(SIZED_SLOTS)('steps %s down through the same setting', (slot) => {
      const { stateName, actionName } = fontSizeSetting(slot, akhandpatt);
      withSettings({ akhandpatt, [stateName]: 7 });
      changeFontSize(slot, false);
      expect(written).toEqual([[actionName, 6]]);
    });
  });

  it('leaves the other view alone', () => {
    const slide = fontSizeSetting('gurbani', false);
    const akhandpatt = fontSizeSetting('gurbani', true);
    withSettings({ akhandpatt: true, [slide.stateName]: 4, [akhandpatt.stateName]: 9 });
    changeFontSize('gurbani', true);
    expect(written).toEqual([[akhandpatt.actionName, 10]]);
  });

  it('keeps its own naming for a slot with no per-view size', () => {
    // A remote is free to name a slot this build has never heard of; falling
    // back keeps that a no-op rather than a crash.
    withSettings({ akhandpatt: true, announcementsFontSize: 5 });
    changeFontSize('announcements', true);
    expect(written).toEqual([['setAnnouncementsFontSize', 6]]);
  });
});

describe('remote visibility control', () => {
  // Only the *size* is per view. What a slot shows, and whether it shows at all,
  // is a choice about the Gurbani rather than about the layout, so it stays
  // shared; it must not acquire an `akhandpatt` variant.
  it.each([false, true])('toggles the one shared setting (akhandpatt: %s)', (akhandpatt) => {
    withSettings({ akhandpatt, translationVisibility: true });
    changeVisibility('translation');
    expect(written).toEqual([['setTranslationVisibility', false]]);
  });
});
