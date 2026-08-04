import {
  createWindow,
  appendShabad,
  prependShabad,
  dropFirstSegment,
  dropLastSegment,
  lastShabadId,
  firstShabadId,
  shabadIdOfVerse,
} from '../../../www/main/viewer/akhandpatt/shabad-window';

/**
 * The sliding window of Shabads mounted during infinite scroll. Keeping
 * `segments` and the flattened `verses` in lock-step lets the hook compensate
 * scroll position by verse count without re-scanning, so each operation checks
 * that invariant.
 */

const verses = (shabadId, count) =>
  Array.from({ length: count }, (unused, index) => ({ ID: shabadId * 1000 + index, shabadId }));

/** segments and verses agree, in order and in count. */
const expectConsistent = (shabadWindow) => {
  const total = shabadWindow.segments.reduce((sum, segment) => sum + segment.count, 0);
  expect(shabadWindow.verses).toHaveLength(total);

  let cursor = 0;
  shabadWindow.segments.forEach((segment) => {
    const slice = shabadWindow.verses.slice(cursor, cursor + segment.count);
    expect(slice.every((verse) => verse.shabadId === segment.shabadId)).toBe(true);
    cursor += segment.count;
  });
};

describe('createWindow', () => {
  it('seeds a window from one Shabad', () => {
    const shabadWindow = createWindow(5480, verses(5480, 12));
    expect(shabadWindow.segments).toEqual([{ shabadId: 5480, count: 12 }]);
    expectConsistent(shabadWindow);
  });

  it('copies the verses it is given', () => {
    // The caller's array comes straight from a DB read that may be reused.
    const seed = verses(5480, 3);
    const shabadWindow = createWindow(5480, seed);
    seed.push({ ID: 999 });
    expect(shabadWindow.verses).toHaveLength(3);
  });
});

describe('appendShabad / prependShabad', () => {
  it('grows the window at the correct end', () => {
    let shabadWindow = createWindow(5480, verses(5480, 4));
    shabadWindow = appendShabad(shabadWindow, 5481, verses(5481, 6));
    shabadWindow = prependShabad(shabadWindow, 5479, verses(5479, 5));

    expect(shabadWindow.segments.map((segment) => segment.shabadId)).toEqual([5479, 5480, 5481]);
    expect(shabadWindow.verses[0].shabadId).toBe(5479);
    expect(shabadWindow.verses[shabadWindow.verses.length - 1].shabadId).toBe(5481);
    expectConsistent(shabadWindow);
  });

  it('is a no-op for a Shabad with no verses', () => {
    // How the loaders detect the ends of the Granth: an empty result must leave
    // the window untouched, and specifically must not add a zero-count segment
    // that would then be pruned as though it were real content.
    const shabadWindow = createWindow(5480, verses(5480, 4));
    expect(appendShabad(shabadWindow, 5481, [])).toBe(shabadWindow);
    expect(prependShabad(shabadWindow, 5479, [])).toBe(shabadWindow);
  });

  it('does not mutate the window it is given', () => {
    // The window is React state; mutating it in place would skip re-renders.
    const shabadWindow = createWindow(5480, verses(5480, 4));
    const before = JSON.stringify(shabadWindow);
    appendShabad(shabadWindow, 5481, verses(5481, 2));
    prependShabad(shabadWindow, 5479, verses(5479, 2));
    expect(JSON.stringify(shabadWindow)).toBe(before);
  });
});

describe('dropFirstSegment / dropLastSegment', () => {
  const threeShabads = () => {
    let shabadWindow = createWindow(5480, verses(5480, 4));
    shabadWindow = appendShabad(shabadWindow, 5481, verses(5481, 6));
    return appendShabad(shabadWindow, 5482, verses(5482, 3));
  };

  it('removes exactly one Shabad, from the end asked for', () => {
    // A prune that took two segments would jump the reading; one that took none
    // would let the DOM grow without bound.
    const first = dropFirstSegment(threeShabads());
    expect(first.segments.map((segment) => segment.shabadId)).toEqual([5481, 5482]);
    expect(first.verses).toHaveLength(9);
    expectConsistent(first);

    const last = dropLastSegment(threeShabads());
    expect(last.segments.map((segment) => segment.shabadId)).toEqual([5480, 5481]);
    expect(last.verses).toHaveLength(10);
    expectConsistent(last);
  });

  it('never empties the window', () => {
    // Something must always be on screen; an empty deck has no anchor, so the
    // follower would have nothing to resolve and the overlay nothing to report.
    const single = createWindow(5480, verses(5480, 4));
    expect(dropFirstSegment(single)).toEqual(single);
    expect(dropLastSegment(single)).toEqual(single);
  });

  it('keeps the window bounded under a long scroll', () => {
    // The scenario the whole window model exists for: scrolling for hours must
    // not grow the DOM without bound.
    let shabadWindow = createWindow(1, verses(1, 10));
    for (let id = 2; id <= 500; id += 1) {
      shabadWindow = appendShabad(shabadWindow, id, verses(id, 10));
      if (shabadWindow.segments.length > 3) {
        shabadWindow = dropFirstSegment(shabadWindow);
      }
    }
    expect(shabadWindow.segments).toHaveLength(3);
    expect(shabadWindow.segments.map((segment) => segment.shabadId)).toEqual([498, 499, 500]);
    expectConsistent(shabadWindow);
  });
});

describe('shabadIdOfVerse', () => {
  it('finds the owning Shabad across segment boundaries', () => {
    let shabadWindow = createWindow(10, verses(10, 3));
    shabadWindow = appendShabad(shabadWindow, 11, verses(11, 2));
    shabadWindow = appendShabad(shabadWindow, 12, verses(12, 4));

    // First, middle and last verse of each segment, including both boundaries.
    expect(shabadIdOfVerse(shabadWindow, 10000)).toBe(10);
    expect(shabadIdOfVerse(shabadWindow, 10002)).toBe(10);
    expect(shabadIdOfVerse(shabadWindow, 11000)).toBe(11);
    expect(shabadIdOfVerse(shabadWindow, 11001)).toBe(11);
    expect(shabadIdOfVerse(shabadWindow, 12000)).toBe(12);
    expect(shabadIdOfVerse(shabadWindow, 12003)).toBe(12);
  });

  it('returns null for a verse that is not mounted', () => {
    expect(shabadIdOfVerse(createWindow(10, verses(10, 3)), 99999)).toBeNull();
  });
});

describe('lastShabadId / firstShabadId', () => {
  it('reports the ids at the window edges', () => {
    let shabadWindow = createWindow(5480, verses(5480, 4));
    shabadWindow = appendShabad(shabadWindow, 5481, verses(5481, 4));
    expect(lastShabadId(shabadWindow)).toBe(5481);
    expect(firstShabadId(shabadWindow)).toBe(5480);
  });

  it('returns null for an empty window', () => {
    const empty = { segments: [], verses: [] };
    expect(lastShabadId(empty)).toBeNull();
    expect(firstShabadId(empty)).toBeNull();
  });
});
