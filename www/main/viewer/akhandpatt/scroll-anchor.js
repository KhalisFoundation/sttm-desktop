/**
 * The content anchor: which verse the centre line sits on, and how far through
 * that verse it is.
 *
 * The operator's preview and the external display mount the same deck but lay it
 * out at different sizes, so a pixel offset from one means nothing in the other.
 * `{ verseId, fraction }` survives the difference. `readScrollAnchor` turns a
 * scroll position into an anchor and `resolveAnchorScrollTop` turns it back;
 * within a window they are exact inverses. The preview reads, the display
 * resolves, and both land on the same line whatever their viewport, font size or
 * loaded range.
 *
 * Sending the anchor between windows is the hook's job. The same conversion also
 * holds the reader's place through a reflow, where nothing is sent anywhere.
 */

import { mountedVerses, verseElement, verseIdOf } from './verse-elements';

// Verse offsets are read via `offsetTop`, which is measured from the nearest
// positioned ancestor rather than the scroll container. That introduces a
// constant difference between offset space and the container's content space;
// measure it once per call from a probe verse instead of taking a bounding rect
// per verse (which would force a layout for every verse in the deck).
//
// The probe's rect carries the sub-pixel transform the scroll loop leaves on the
// content, and `container.scrollTop` is short by exactly that fraction. Together
// they describe the position actually painted, which is what an anchor should
// name, so this reads the same anchor a container with unlimited scroll
// precision would have given.
const offsetToContentDelta = (container, probe) =>
  probe.getBoundingClientRect().top -
  container.getBoundingClientRect().top +
  container.scrollTop -
  probe.offsetTop;

/**
 * The content point currently on the deck's centre line, expressed so another
 * window can reproduce it.
 *
 * @param {HTMLElement} container The scrollable deck element
 * @returns {{verseId: number, fraction: number}|null} Anchor, or null if the
 *   deck has no verses mounted yet
 */
export const readScrollAnchor = (container) => {
  const verses = mountedVerses(container);
  if (!verses.length) {
    return null;
  }
  const delta = offsetToContentDelta(container, verses[0]);
  const centre = container.scrollTop + container.clientHeight / 2;

  // Verses are in document order, so their offsets ascend: binary search for the
  // one spanning the centre line rather than walking the whole loaded window.
  let low = 0;
  let high = verses.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (verses[mid].offsetTop + delta <= centre) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  const verse = verses[low];
  const verseId = verseIdOf(verse);
  if (Number.isNaN(verseId)) {
    return null;
  }
  const height = verse.offsetHeight;
  // Clamped because the centre line can sit in the deck's centring padding,
  // above the first verse or below the last, where it belongs to no verse.
  const fraction = height > 0 ? (centre - (verse.offsetTop + delta)) / height : 0;
  return { verseId, fraction: Math.min(1, Math.max(0, fraction)) };
};

/**
 * The scroll position that puts an anchor on this deck's centre line.
 *
 * @param {HTMLElement} container The scrollable deck element
 * @param {{verseId: number, fraction: number}} anchor Anchor to resolve
 * @returns {number|null} Target scrollTop, or null if the anchor's verse is not
 *   currently mounted in this window
 */
export const resolveAnchorScrollTop = (container, anchor) => {
  if (!anchor) {
    return null;
  }
  const verse = verseElement(container, anchor.verseId);
  if (!verse) {
    return null;
  }
  const delta = offsetToContentDelta(container, verse);
  const centre = verse.offsetTop + delta + anchor.fraction * verse.offsetHeight;
  return centre - container.clientHeight / 2;
};
