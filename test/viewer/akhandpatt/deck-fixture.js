/**
 * A stand-in for a rendered Akhand Paatth deck.
 *
 * `scroll-anchor` reads `offsetTop`, `offsetHeight`, and `getBoundingClientRect`.
 * jsdom reports zero for this layout data, so this fake models the geometry
 * explicitly. A test can then state the dimensions of two windows rendering the
 * same Gurbani at different sizes.
 *
 * The fake uses these scroll-container relationships:
 *   - a verse at content offset `c` has viewport top `containerTop - scrollTop + c`
 *   - `offsetTop` is measured from the nearest positioned ancestor, so it is
 *     `c - offsetOrigin` for a constant origin; `offsetToContentDelta` cancels
 *     this skew
 *   - the scroll loop's sub-pixel transform sits on the content wrapper, so it
 *     moves the verses' rects and not the container's
 */

const {
  wholePixels,
  subPixelTransform,
} = require('../../../www/main/viewer/akhandpatt/scroll-motion');

const CONTAINER_VIEWPORT_TOP = 64;

/**
 * @param {object} options
 * @param {number[]} options.verseIds Verse ids, in document order
 * @param {number|number[]} options.verseHeight Uniform height, or one per verse
 * @param {number} options.clientHeight Visible height of the deck
 * @param {number} [options.scrollTop]
 * @param {number} [options.offsetOrigin] Skew between offset space and content space
 * @param {number} [options.padTop] Centring padding above the first verse
 * @returns {object} An object satisfying the subset of the DOM `scroll-anchor` uses
 */
const createDeck = ({
  verseIds,
  verseHeight,
  clientHeight,
  scrollTop = 0,
  offsetOrigin = 0,
  padTop = 0,
}) => {
  const heights = Array.isArray(verseHeight) ? verseHeight : verseIds.map(() => verseHeight);

  const deck = {
    scrollTop,
    clientHeight,
    // The transform the scroll loop leaves on the content wrapper, in px.
    contentTranslateY: 0,
    getBoundingClientRect: () => ({ top: CONTAINER_VIEWPORT_TOP }),
  };

  let contentOffset = padTop;
  const verses = verseIds.map((id, index) => {
    const top = contentOffset;
    contentOffset += heights[index];
    return {
      dataset: { verseid: String(id) },
      offsetTop: top - offsetOrigin,
      offsetHeight: heights[index],
      contentTop: top,
      getBoundingClientRect: () => ({
        top: CONTAINER_VIEWPORT_TOP - deck.scrollTop + top + deck.contentTranslateY,
      }),
    };
  });

  deck.scrollHeight = contentOffset + padTop;
  deck.querySelectorAll = () => verses;
  deck.querySelector = (selector) => {
    const id = selector.match(/"(.*)"/)[1];
    return verses.find((verse) => verse.dataset.verseid === id) || null;
  };

  /**
   * Scroll to a position that may carry a fraction of a pixel, exactly as the
   * running app does: whole pixels to `scrollTop`, the remainder to a transform
   * on the content.
   *
   * Named after, and routed through, the production code rather than
   * reimplementing it. Changes such as rounding instead of truncating or flipping
   * the transform's sign therefore fail these tests.
   *
   * @param {number} value Scroll position in px, fractions included
   */
  deck.writeScrollPosition = (value) => {
    deck.scrollTop = wholePixels(value);
    const transform = subPixelTransform(value);
    const translateY = transform.match(/^translateY\((-?[\d.]+)px\)$/);
    deck.contentTranslateY = translateY ? Number(translateY[1]) : 0;
  };

  return deck;
};

/** The content offset currently on the deck's centre line. */
const centreOffset = (deck) => deck.scrollTop + deck.clientHeight / 2;

module.exports = { createDeck, centreOffset, CONTAINER_VIEWPORT_TOP };
