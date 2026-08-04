/**
 * Keeps the per-view font-size resolver wired to real settings.
 *
 * If a name drifts from the schema, the Quick Tools stepper writes to a setting
 * that nothing renders. Every name is derived from the schema here so a typo
 * fails the test.
 */
const convertToCamelCase = require('../../www/main/common/utils/convert-to-camel-case').default;
const { CONTENT_SLOTS, fontSizeSetting } = require('../../www/main/viewer/font-sizes');
const { settings } = require('../../www/configs/user-settings.json');

const schemaFields = Object.fromEntries(
  Object.keys(settings).map((key) => [
    convertToCamelCase(key),
    { actionName: `set${convertToCamelCase(key, true)}`, schema: settings[key] },
  ]),
);

const SIZED_SLOTS = ['gurbani', ...CONTENT_SLOTS];

const VIEWS = [
  ['the slide view', false],
  ['Akhand Paatth', true],
];

describe('fontSizeSetting', () => {
  describe.each(SIZED_SLOTS)('%s', (slot) => {
    it.each(VIEWS)('resolves to a real, writable setting for %s', (_label, akhandpatt) => {
      const { stateName, actionName } = fontSizeSetting(slot, akhandpatt);
      expect(schemaFields[stateName]).toBeDefined();
      expect(actionName).toBe(schemaFields[stateName].actionName);
    });

    it('gives the two views separate settings', () => {
      expect(fontSizeSetting(slot, true).stateName).not.toBe(
        fontSizeSetting(slot, false).stateName,
      );
    });

    it.each(VIEWS)('is shown in the Font Sizes panel only for %s', (_label, akhandpatt) => {
      // Both sizes exist at once, so the panel must show the one used by the
      // preview and steppers. Otherwise a slider changes a value not rendered
      // on screen.
      const { schema } = schemaFields[fontSizeSetting(slot, akhandpatt).stateName];
      expect(schema.condition).toBe('akhandpatt');
      expect(schema.conditionValue).toBe(akhandpatt);
    });

    it('is restored by the Reset Font Sizes button in both views', () => {
      const { resetSettings } = settings['reset-font-sizes'];
      const restored = resetSettings.map((key) => convertToCamelCase(key));
      VIEWS.forEach(([, akhandpatt]) => {
        expect(restored).toContain(fontSizeSetting(slot, akhandpatt).stateName);
      });
    });
  });

  it('gives every sized slot its own setting', () => {
    const names = SIZED_SLOTS.flatMap((slot) =>
      VIEWS.map(([, akhandpatt]) => fontSizeSetting(slot, akhandpatt).stateName),
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it('starts the Akhand Paatth Gurbani a step smaller than the slide view', () => {
    // A slide gives one verse the whole screen; Akhand Paatth stacks them, so
    // the same size leaves too few lines in view to read ahead.
    const sizeOf = (akhandpatt) =>
      schemaFields[fontSizeSetting('gurbani', akhandpatt).stateName].schema.initialValue;
    expect(sizeOf(true)).toBe(sizeOf(false) - 1);
  });

  it.each(CONTENT_SLOTS)('starts %s at the size the slide view uses', (slot) => {
    // The split exists so the two views can drift apart once a reader tunes
    // them, not to make them look different out of the box.
    const sizeOf = (akhandpatt) =>
      schemaFields[fontSizeSetting(slot, akhandpatt).stateName].schema.initialValue;
    expect(sizeOf(true)).toBe(sizeOf(false));
  });

  it('leaves slots with no per-view size to the caller', () => {
    // `QuickTools` falls back to its own naming for these, so resolving them to
    // a Gurbani setting here would repoint a stepper.
    expect(fontSizeSetting('announcements', true)).toBeNull();
    expect(fontSizeSetting('announcements', false)).toBeNull();
  });
});
