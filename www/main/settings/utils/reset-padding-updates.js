import { DEFAULT_LINE_SPACING, DEFAULT_VERSE_SPACING } from '../../common/constants';

/** The padding the deck ships with, restored by the Reset Padding button. */
export const DEFAULT_PADDING = {
  left: 48,
  top: 20,
  right: 0,
  bottom: 0,
};

/**
 * Decide which viewer settings the Reset Padding button restores.
 *
 * Container padding applies to both the slide deck and the Akhand Paatth deck,
 * so it always resets. The two spacing axes exist only in Akhand Paatth, where
 * the Spacing control takes the place of Padding Tools. Resetting those from the
 * slide view would silently discard a setting the operator cannot see, and would
 * not be undoable.
 *
 * Settings already at their default are left out so the button does not
 * broadcast writes that change nothing.
 *
 * @param {object} current
 * @param {object} current.containerPadding Padding by edge, as stored.
 * @param {number} current.verseSpacing Space around each verse.
 * @param {number} current.lineSpacing Space between the lines within a verse.
 * @param {boolean} current.akhandpatt Whether Akhand Paatth is the active view.
 * @returns {Array<{actionName: string, payload: *, settingType: string}>}
 *   The `update-global-setting` messages to send, in order.
 */
export const resetPaddingUpdates = ({
  containerPadding,
  verseSpacing,
  lineSpacing,
  akhandpatt,
}) => {
  const updates = Object.keys(containerPadding)
    .filter((edge) => containerPadding[edge] !== DEFAULT_PADDING[edge])
    .map((edge) => ({
      actionName: 'setPadding',
      payload: { type: edge, value: DEFAULT_PADDING[edge] },
      settingType: 'viewerSettings',
    }));

  if (!akhandpatt) {
    return updates;
  }

  return updates.concat(
    [
      { current: verseSpacing, fallback: DEFAULT_VERSE_SPACING, actionName: 'setVerseSpacing' },
      { current: lineSpacing, fallback: DEFAULT_LINE_SPACING, actionName: 'setLineSpacing' },
    ]
      .filter(({ current: value, fallback }) => value !== fallback)
      .map(({ fallback, actionName }) => ({
        actionName,
        payload: fallback,
        settingType: 'viewerSettings',
      })),
  );
};
