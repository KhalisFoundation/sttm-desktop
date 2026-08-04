/**
 * Which font size setting the viewer is currently sized by.
 *
 * The two views want genuinely different type sizes. A slide gives a single
 * verse the whole screen, so it can afford to be large; Akhand Paatth stacks
 * verses into a scrolling column, where the same size leaves too few lines in
 * view to read ahead. Each line of a verse (the Gurbani and the three content
 * slots beneath it) therefore keeps a separate persisted size per view.
 *
 * Only the *size* splits. Which content a slot shows, and whether it shows at
 * all, stay shared: those are choices about the Gurbani, not about how a
 * particular layout renders it.
 *
 * The controls themselves are unchanged — the same Quick Tools steppers and
 * Font Sizes sliders drive both views, over the same range and steps. Only the
 * setting they land on differs, and it is resolved here, in one place, so a
 * stepper and a renderer cannot end up on different settings.
 */

/** The content slots, in the order they render beneath the Gurbani. */
export const CONTENT_SLOTS = ['content1', 'content2', 'content3'];

const SLIDE_VIEW = {
  gurbani: { stateName: 'gurbaniFontSize', actionName: 'setGurbaniFontSize' },
  content1: { stateName: 'content1FontSize', actionName: 'setContent1FontSize' },
  content2: { stateName: 'content2FontSize', actionName: 'setContent2FontSize' },
  content3: { stateName: 'content3FontSize', actionName: 'setContent3FontSize' },
};

const AKHANDPATT_VIEW = {
  gurbani: {
    stateName: 'akhandpattGurbaniFontSize',
    actionName: 'setAkhandpattGurbaniFontSize',
  },
  content1: {
    stateName: 'akhandpattContent1FontSize',
    actionName: 'setAkhandpattContent1FontSize',
  },
  content2: {
    stateName: 'akhandpattContent2FontSize',
    actionName: 'setAkhandpattContent2FontSize',
  },
  content3: {
    stateName: 'akhandpattContent3FontSize',
    actionName: 'setAkhandpattContent3FontSize',
  },
};

/**
 * The `userSettings` field holding a slot's size in the view that is on screen.
 *
 * Slots outside the verse (announcements, say) are not sized per view and so
 * are not listed; they resolve to `null` and the caller keeps its own naming.
 *
 * @param {string} slot `'gurbani'`, or one of `CONTENT_SLOTS`
 * @param {boolean} akhandpatt Whether Akhand Paatth view is active
 * @returns {?{stateName: string, actionName: string}} The field holding the size
 *   for that slot in that view, and the action that writes it, or `null` if the
 *   slot has no per-view size
 */
export const fontSizeSetting = (slot, akhandpatt) =>
  (akhandpatt && AKHANDPATT_VIEW[slot]) || SLIDE_VIEW[slot] || null;
