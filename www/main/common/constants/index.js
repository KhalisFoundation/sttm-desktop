export { API_ENDPOINT } from './api-urls';

export { default as globalInit } from './global-init';
export const DEFAULT_OVERLAY = 'none';
/**
 * Defaults for the two Akhand Paatth spacing axes, in the reference-design pixels
 * the Spacing control and `_verse-slide.scss` both work in.
 *
 * `verse` is the gap between one verse and the next. `line` is the gap between
 * the lines *inside* a verse: the Gurbani and its translation, transliteration
 * and teeka. Keeping the inner gap tighter than the outer one is what visually
 * binds a verse together.
 *
 * `$akhandpatt-default-verse-spacing` and `$akhandpatt-default-line-spacing` in
 * `_verse-slide.scss` mirror these as the CSS fallbacks; keep them in step.
 */
export const DEFAULT_VERSE_SPACING = 32;
export const DEFAULT_LINE_SPACING = 14;
export const nitnemBaniIds = [2, 4, 6, 9, 10, 20, 21, 23];
export const popularBaniIds = [90, 30, 31, 22];
export const ceremoniesFilter = {
  visible: [1, 3, 5],
  englishToggle: [1],
  raagmalaToggle: [5],
  raagmalaMap: { 5: 6 },
};
export const ZOOM_LINK =
  'https://support.khalisfoundation.org/en/support/solutions/articles/63000255302-how-to-use-zoom-overlay-with-sikhitothemax';
