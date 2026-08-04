import {
  resetPaddingUpdates,
  DEFAULT_PADDING,
} from '../../www/main/settings/utils/reset-padding-updates';
import { DEFAULT_LINE_SPACING, DEFAULT_VERSE_SPACING } from '../../www/main/common/constants';

const MOVED_PADDING = { left: 10, top: 10, right: 10, bottom: 10 };

const namesOf = (updates) => updates.map((update) => update.actionName);

describe('what Reset Padding restores', () => {
  it('restores every edge the operator moved', () => {
    const updates = resetPaddingUpdates({
      containerPadding: MOVED_PADDING,
      verseSpacing: DEFAULT_VERSE_SPACING,
      lineSpacing: DEFAULT_LINE_SPACING,
      akhandpatt: false,
    });

    expect(namesOf(updates)).toEqual(['setPadding', 'setPadding', 'setPadding', 'setPadding']);
    expect(updates.map((update) => update.payload)).toEqual(
      Object.keys(MOVED_PADDING).map((edge) => ({ type: edge, value: DEFAULT_PADDING[edge] })),
    );
  });

  it('says nothing when everything is already at its default', () => {
    expect(
      resetPaddingUpdates({
        containerPadding: DEFAULT_PADDING,
        verseSpacing: DEFAULT_VERSE_SPACING,
        lineSpacing: DEFAULT_LINE_SPACING,
        akhandpatt: true,
      }),
    ).toEqual([]);
  });

  // The spacing axes replace Padding Tools in Akhand Paatth and have no control
  // in the slide view. Resetting them there would discard hidden adjustments.
  it('leaves the spacing axes alone from the slide view', () => {
    const updates = resetPaddingUpdates({
      containerPadding: DEFAULT_PADDING,
      verseSpacing: 99,
      lineSpacing: 99,
      akhandpatt: false,
    });

    expect(updates).toEqual([]);
  });

  it('restores the spacing axes from the Akhand Paatth view', () => {
    const updates = resetPaddingUpdates({
      containerPadding: DEFAULT_PADDING,
      verseSpacing: 99,
      lineSpacing: 99,
      akhandpatt: true,
    });

    expect(namesOf(updates)).toEqual(['setVerseSpacing', 'setLineSpacing']);
    expect(updates.map((update) => update.payload)).toEqual([
      DEFAULT_VERSE_SPACING,
      DEFAULT_LINE_SPACING,
    ]);
  });

  it('restores padding and spacing together in Akhand Paatth', () => {
    const updates = resetPaddingUpdates({
      containerPadding: MOVED_PADDING,
      verseSpacing: 99,
      lineSpacing: 99,
      akhandpatt: true,
    });

    expect(namesOf(updates)).toEqual([
      'setPadding',
      'setPadding',
      'setPadding',
      'setPadding',
      'setVerseSpacing',
      'setLineSpacing',
    ]);
  });

  it('addresses every update to the viewer settings', () => {
    const updates = resetPaddingUpdates({
      containerPadding: MOVED_PADDING,
      verseSpacing: 99,
      lineSpacing: 99,
      akhandpatt: true,
    });

    updates.forEach((update) => expect(update.settingType).toBe('viewerSettings'));
  });
});
