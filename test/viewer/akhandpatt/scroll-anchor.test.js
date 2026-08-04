import {
  readScrollAnchor,
  resolveAnchorScrollTop,
} from '../../../www/main/viewer/akhandpatt/scroll-anchor';
import { createDeck } from './deck-fixture';

/**
 * The external display mirrors the operator's preview by content anchor rather
 * than by pixel offset, because the two windows lay the same Gurbani out at very
 * different sizes. These tests pin that contract down.
 *
 * The geometry used throughout is the real measured geometry from a 1080p laptop
 * preview beside a 1440p projection: the preview showed ~5.6 verses per screen at
 * 152px a verse in a 497px viewport, the projection the same ~5.6 verses at 351px
 * a verse in a 1150px viewport. Sending a pixel offset between those two is
 * meaningless, and doing so is what made the decks drift 1.5x apart.
 */

const VERSE_IDS = [60200, 60201, 60202, 60203, 60204, 60205, 60206, 60207, 60208, 60209];

/**
 * Anchors must match to well beyond sub-pixel precision, but they are floats
 * derived through different arithmetic in each window, so compare the verse
 * exactly and the fraction to a tolerance far tighter than a pixel of any verse.
 */
const expectSameAnchor = (received, expected) => {
  expect(received.verseId).toBe(expected.verseId);
  expect(received.fraction).toBeCloseTo(expected.fraction, 9);
};

const previewDeck = (overrides = {}) =>
  createDeck({ verseIds: VERSE_IDS, verseHeight: 152, clientHeight: 497, ...overrides });

const projectionDeck = (overrides = {}) =>
  createDeck({ verseIds: VERSE_IDS, verseHeight: 351, clientHeight: 1150, ...overrides });

describe('readScrollAnchor / resolveAnchorScrollTop', () => {
  it('are exact inverses within a window', () => {
    // Every position where the centre line falls inside a verse must survive the
    // round trip untouched. Anything less and every broadcast would nudge the
    // follower, accumulating into drift over an hours-long Paatth.
    for (let scrollTop = 0; scrollTop <= 1250; scrollTop += 37) {
      const deck = previewDeck({ scrollTop });
      const anchor = readScrollAnchor(deck);
      expect(resolveAnchorScrollTop(deck, anchor)).toBeCloseTo(scrollTop, 6);
    }
  });

  it('survives the round trip when offset space is skewed by a positioned ancestor', () => {
    // `offsetTop` is measured from the nearest positioned ancestor, not the
    // scroll container, and the deck sets `position: relative`. Dropping the
    // correction for that skew would still round-trip within one window but put
    // the follower a constant distance out. This also checks that the anchor at
    // a given scroll position is unchanged by the skew.
    const reference = readScrollAnchor(previewDeck({ scrollTop: 611, padTop: 240 }));
    [40, -220, 1337].forEach((offsetOrigin) => {
      const deck = previewDeck({ scrollTop: 611, offsetOrigin, padTop: 240 });
      const anchor = readScrollAnchor(deck);
      expectSameAnchor(anchor, reference);
      expect(resolveAnchorScrollTop(deck, anchor)).toBeCloseTo(611, 6);
    });
  });

  it('survives the round trip with unequal verse heights', () => {
    // Real Gurbani verses differ: a one-line salok next to a four-line pankti,
    // with and without translations. The binary search must still land on the
    // verse spanning the centre line.
    const verseHeight = [96, 310, 152, 152, 428, 96, 224, 152, 380, 118];
    for (let scrollTop = 0; scrollTop <= 1600; scrollTop += 53) {
      const deck = previewDeck({ scrollTop, verseHeight });
      const anchor = readScrollAnchor(deck);
      expect(resolveAnchorScrollTop(deck, anchor)).toBeCloseTo(scrollTop, 6);
    }
  });

  it('always selects the verse that actually spans the centre line', () => {
    // This checks the binary search independently of the round trip because
    // matching off-by-one errors could cancel each other.
    const verseHeight = [96, 310, 152, 152, 428, 96, 224, 152, 380, 118];
    const deck = previewDeck({ verseHeight, padTop: 200 });
    const verses = deck.querySelectorAll();

    for (let scrollTop = 0; scrollTop <= 2000; scrollTop += 17) {
      deck.scrollTop = scrollTop;
      const centre = scrollTop + deck.clientHeight / 2;
      const expected = verses.filter(
        (verse) => verse.contentTop <= centre && centre < verse.contentTop + verse.offsetHeight,
      )[0];
      if (!expected) {
        continue; // Centre line is in the deck's centring padding, not on a verse.
      }
      expect(readScrollAnchor(deck).verseId).toBe(Number(expected.dataset.verseid));
    }
  });

  it('picks the verse starting on the centre line, not the one ending there', () => {
    // Every other deck in this file has an odd `clientHeight`, so its centre line
    // falls on a half pixel and can never coincide with a verse edge. That leaves
    // the one position where the binary search's comparator actually decides
    // anything untested: the search either keeps the verse whose top equals the
    // centre, or steps back to the one above it, and nothing else in this suite
    // can tell those apart.
    //
    // A verse occupies [top, top + height), so a centre line on an edge
    // belongs to the verse beginning there. Getting this backwards would put the
    // projection one verse behind the preview at these infrequent positions.
    const deck = createDeck({
      verseIds: VERSE_IDS,
      verseHeight: 152,
      clientHeight: 400,
      scrollTop: 256,
    });
    const boundaryVerse = 3;
    expect(deck.scrollTop + deck.clientHeight / 2).toBe(boundaryVerse * 152);

    const anchor = readScrollAnchor(deck);
    expect(anchor.verseId).toBe(VERSE_IDS[boundaryVerse]);
    expect(anchor.fraction).toBeCloseTo(0, 9);
  });
});

describe('anchoring across two windows of different geometry', () => {
  it('puts the same content point on both centre lines', () => {
    // Both decks must agree on the Gurbani rather than the pixels; the pixel
    // offsets here differ by 2.3x.
    const preview = previewDeck({ scrollTop: 700 });
    const projection = projectionDeck();

    const anchor = readScrollAnchor(preview);
    projection.scrollTop = resolveAnchorScrollTop(projection, anchor);

    expectSameAnchor(readScrollAnchor(projection), anchor);
    expect(projection.scrollTop).not.toBeCloseTo(preview.scrollTop, 0);
  });

  it('agrees at every scroll position, in both directions', () => {
    for (let scrollTop = 0; scrollTop <= 1200; scrollTop += 41) {
      const preview = previewDeck({ scrollTop });
      const projection = projectionDeck();

      const sent = readScrollAnchor(preview);
      projection.scrollTop = resolveAnchorScrollTop(projection, sent);
      expectSameAnchor(readScrollAnchor(projection), sent);

      // And back the other way: the follower relationship can be either way
      // round in principle, and the inverse must hold identically.
      const returned = readScrollAnchor(projection);
      preview.scrollTop = resolveAnchorScrollTop(preview, returned);
      expectSameAnchor(readScrollAnchor(preview), returned);
    }
  });

  it('is unaffected by the two windows loading different Shabads', () => {
    // Each window prunes and loads on its own cadence, so the follower routinely
    // holds a different slice of the Granth. As long as the anchor's verse is
    // mounted, the anchor must still resolve.
    const preview = previewDeck({ scrollTop: 900 });
    const anchor = readScrollAnchor(preview);
    const projection = createDeck({
      verseIds: [60198, 60199, ...VERSE_IDS, 60210, 60211],
      verseHeight: 351,
      clientHeight: 1150,
      padTop: 575,
    });

    projection.scrollTop = resolveAnchorScrollTop(projection, anchor);
    expectSameAnchor(readScrollAnchor(projection), anchor);
  });
});

describe('the sub-pixel scroll split', () => {
  /**
   * The scroll loop cannot put a fractional position into `scrollTop` because
   * Chromium quantises it to a whole physical pixel (measured on Electron 26).
   * It truncates and paints the remainder as a transform on the content. That
   * transform moves the verses' bounding rects, which is how this module measures
   * them, so the two are coupled whether or not anyone intends them to be.
   */

  it('reads the anchor off the painted position, not the truncated one', () => {
    // The split is invisible here: the transform moves the verse rects by exactly
    // the fraction `scrollTop` was short of, so the anchor comes out identical to
    // one read from a hypothetical container that could scroll to the fraction
    // directly. Were that not so, the anchor would describe a line up to a pixel
    // away from the one the reader is actually looking at.
    for (let whole = 0; whole <= 1200; whole += 47) {
      [0.1, 0.25, 0.5, 0.75, 0.9].forEach((fraction) => {
        const position = whole + fraction;
        const ideal = previewDeck({ scrollTop: position });

        const deck = previewDeck();
        deck.writeScrollPosition(position);

        expectSameAnchor(readScrollAnchor(deck), readScrollAnchor(ideal));
      });
    }
  });

  it('still round-trips with a transform applied', () => {
    // Read and resolve must remain exact inverses, or every anchor broadcast
    // would nudge the follower by up to a pixel and the two decks would walk
    // apart over an hours-long Paatth.
    for (let position = 0.5; position <= 1200; position += 41.37) {
      const deck = previewDeck();
      deck.writeScrollPosition(position);
      const resolved = resolveAnchorScrollTop(deck, readScrollAnchor(deck));
      expect(resolved).toBeCloseTo(deck.scrollTop, 6);
    }
  });

  it('resolves to a whole pixel, so a seek can land a fraction short', () => {
    // The one residual of the split. `resolveAnchorScrollTop` answers in whole
    // pixels, so seeking to an anchor drops the fraction the deck was painted
    // with. It is under a pixel and taken fresh from the DOM each time rather
    // than carried forward, so it cannot accumulate. A coarser quantum would
    // increase the shortfall.
    const painted = 703.75;
    const deck = previewDeck();
    deck.writeScrollPosition(painted);

    const shortfall = painted - resolveAnchorScrollTop(deck, readScrollAnchor(deck));
    expect(shortfall).toBeGreaterThanOrEqual(0);
    expect(shortfall).toBeLessThan(1);
  });
});

describe('boundaries', () => {
  it('returns null for a deck with no verses mounted', () => {
    const deck = createDeck({ verseIds: [], verseHeight: 152, clientHeight: 497 });
    expect(readScrollAnchor(deck)).toBeNull();
  });

  it('returns null when the anchor verse is not mounted here', () => {
    // The follower answers this by growing its window towards the anchor, so a
    // null must stay distinguishable from a legitimate scrollTop of 0.
    expect(resolveAnchorScrollTop(previewDeck(), { verseId: 999999, fraction: 0.5 })).toBeNull();
  });

  it('returns null for a missing anchor', () => {
    expect(resolveAnchorScrollTop(previewDeck(), null)).toBeNull();
  });

  it('clamps the fraction when the centre line sits in the centring padding', () => {
    // The deck pads top and bottom so the first and last verses can reach the
    // centre line. In that padding the centre belongs to no verse, and an
    // unclamped fraction would resolve to a position outside the verse entirely.
    const top = previewDeck({ scrollTop: 0, padTop: 600 });
    expect(readScrollAnchor(top)).toEqual({ verseId: VERSE_IDS[0], fraction: 0 });

    const bottom = previewDeck({ scrollTop: 4000, padTop: 0 });
    const anchor = readScrollAnchor(bottom);
    expect(anchor.verseId).toBe(VERSE_IDS[VERSE_IDS.length - 1]);
    expect(anchor.fraction).toBe(1);
  });

  it('does not divide by a zero-height verse', () => {
    // Freshly prepended verses mount at zero height for a frame or two before the
    // Gurmukhi font lands; a NaN anchor there would poison the follower, which
    // applies whatever it is sent.
    const deck = previewDeck({ verseHeight: 0, scrollTop: 0 });
    const anchor = readScrollAnchor(deck);
    expect(anchor.fraction).toBe(0);
    expect(VERSE_IDS).toContain(anchor.verseId);
  });

  it('ignores a verse whose id is not a number', () => {
    const deck = previewDeck({ scrollTop: 300 });
    deck.querySelectorAll().forEach((verse) => {
      Object.assign(verse.dataset, { verseid: 'not-a-number' });
    });
    expect(readScrollAnchor(deck)).toBeNull();
  });
});
