/**
 * @jest-environment jsdom
 */

/**
 * Reading backwards loads the previous Shabad above the viewport. Those verses
 * mount at roughly nothing and reach their real height a few frames later, so a
 * one-shot compensation at commit time cannot see the growth. A settle loop
 * covers it: it holds one anchor verse still while the content above it fills
 * in.
 *
 * Scrolling up quickly asks for a second Shabad before the first has finished
 * growing. Each prepend anchors on the verse that was the head before it ran, so
 * the second anchor is always further up the page than the first. An anchor only
 * absorbs growth above itself, so re-anchoring upward abandons the part of the
 * page the reader is actually looking at, and the first Shabad's remaining
 * growth pushes the reader down.
 *
 * This drives the real hook through two overlapping prepends and then inflates
 * the first one, which is the order the app hits when the wheel crosses two
 * boundaries in quick succession.
 */
const React = require('react');
const { createRoot } = require('react-dom/client');

// eslint-disable-next-line global-require
const act = React.act || require('react-dom/test-utils').act;

jest.mock('electron', () => ({
  ipcRenderer: { on: () => {}, off: () => {}, send: () => {}, removeListener: () => {} },
}));

jest.mock('../../../www/main/navigator/shabad/utils/filter-verse-items', () => ({
  filterRequiredVerseItems: (verses) => verses,
  filterOverlayVerseItems: (verses) => verses,
}));

jest.mock('../../../www/main/viewer/akhandpatt/shabad-feed', () => ({
  readShabad: jest.fn(),
  readNextShabad: jest.fn(),
  readPrevShabad: jest.fn(),
}));

const feed = require('../../../www/main/viewer/akhandpatt/shabad-feed');
const { useAkhandpattScroll } = require('../../../www/main/viewer/akhandpatt/useAkhandpattScroll');

const CLIENT_HEIGHT = 500;
const SETTLED_HEIGHT = 200;
const UNLAID_HEIGHT = 10;
// Enough verses per Shabad that the scrollable range is comfortably longer than
// the height this test inflates. A deck only a viewport tall cannot scroll, so
// the compensation would clamp instead of running and the test would measure
// the clamp rather than the anchor.
const VERSES_PER_SHABAD = 6;

const verseIdsFor = (shabadId) =>
  Array.from({ length: VERSES_PER_SHABAD }, (unused, i) => shabadId * 10 + i + 1);
const versesFor = (shabadId) =>
  verseIdsFor(shabadId).map((ID) => ({ ID, Gurmukhi: 'a', ShabadID: shabadId }));

/**
 * The page geometry jsdom will not provide. Verse heights are declared here so a
 * test can inflate a Shabad the way late font reflow does, and every offset the
 * hook reads is derived from them in document order.
 */
const createPage = () => {
  const heights = new Map();
  let order = [];
  let scrollTop = 0;

  const contentTopOf = (verseId) => {
    let top = 0;
    for (let i = 0; i < order.length; i += 1) {
      if (order[i] === verseId) {
        return top;
      }
      top += heights.get(order[i]) || 0;
    }
    return null;
  };

  const contentHeight = () => order.reduce((sum, id) => sum + (heights.get(id) || 0), 0);

  return {
    setOrder: (ids) => {
      order = ids;
      ids.forEach((id) => {
        if (!heights.has(id)) {
          heights.set(id, UNLAID_HEIGHT);
        }
      });
    },
    /** Late reflow: give a Shabad's verses their real height. */
    inflate: (shabadId) => {
      verseIdsFor(shabadId).forEach((id) => heights.set(id, SETTLED_HEIGHT));
    },
    /** Reflow that arrives a little at a time, as a slow font swap does. */
    grow: (shabadId, px) => {
      verseIdsFor(shabadId).forEach((id) => heights.set(id, (heights.get(id) || 0) + px));
    },
    contentTopOf,
    viewportTopOf: (verseId) => {
      const top = contentTopOf(verseId);
      return top === null ? null : top - scrollTop;
    },
    attachContainer: (node) => {
      if (Object.getOwnPropertyDescriptor(node, 'clientHeight')) {
        return;
      }
      Object.defineProperty(node, 'clientHeight', { configurable: true, value: CLIENT_HEIGHT });
      Object.defineProperty(node, 'clientWidth', { configurable: true, value: 800 });
      Object.defineProperty(node, 'scrollHeight', {
        configurable: true,
        get: () => contentHeight(),
      });
      Object.defineProperty(node, 'scrollTop', {
        configurable: true,
        get: () => scrollTop,
        set: (value) => {
          scrollTop = value;
        },
      });
      // eslint-disable-next-line no-param-reassign
      node.getBoundingClientRect = () => ({ top: 0, left: 0, width: 800, height: CLIENT_HEIGHT });
    },
    attachVerse: (node, verseId) => {
      Object.defineProperty(node, 'offsetTop', {
        configurable: true,
        get: () => contentTopOf(verseId) || 0,
      });
      Object.defineProperty(node, 'offsetHeight', {
        configurable: true,
        get: () => heights.get(verseId) || 0,
      });
      // eslint-disable-next-line no-param-reassign
      node.getBoundingClientRect = () => ({
        top: (contentTopOf(verseId) || 0) - scrollTop,
        left: 0,
        width: 800,
        height: heights.get(verseId) || 0,
      });
    },
    scrollTo: (value) => {
      scrollTop = value;
    },
    scrollTopNow: () => scrollTop,
    /**
     * jsdom performs no hit-testing, so `document.elementFromPoint` is missing.
     * The hook uses it to find the verse on the container's centre line, which
     * this resolves from the same declared geometry.
     */
    elementFromPoint: (unusedX, y) => {
      const contentY = y + scrollTop;
      let top = 0;
      for (let i = 0; i < order.length; i += 1) {
        const height = heights.get(order[i]) || 0;
        if (contentY >= top && contentY < top + height) {
          return document.querySelector(`[data-verseid="${order[i]}"]`);
        }
        top += height;
      }
      return null;
    },
  };
};

/** Holds the frame queue so the test decides when a frame runs. */
const takeOverAnimationFrames = () => {
  const pending = new Map();
  let nextId = 1;
  const realRaf = global.requestAnimationFrame;
  const realCancel = global.cancelAnimationFrame;

  global.requestAnimationFrame = (callback) => {
    const id = nextId;
    nextId += 1;
    pending.set(id, callback);
    return id;
  };
  global.cancelAnimationFrame = (id) => pending.delete(id);

  return {
    pump: (timestamp) => {
      const due = [...pending.entries()];
      pending.clear();
      due.forEach(([, callback]) => callback(timestamp));
    },
    restore: () => {
      global.requestAnimationFrame = realRaf;
      global.cancelAnimationFrame = realCancel;
    },
  };
};

describe('two prepends that overlap while the first is still growing', () => {
  let page;
  let frames;
  let root;
  let host;
  let clock;
  let nowSpy;

  /* eslint-disable react/prop-types */
  const Harness = () => {
    const containerRef = React.useRef(null);
    const contentRef = React.useRef(null);
    const verseRefs = React.useRef({});
    const [verses, setVerses] = React.useState([]);

    useAkhandpattScroll({
      containerRef,
      contentRef,
      verseRefs,
      akhandpatt: true,
      infinite: true,
      isPlaying: true,
      // The slowest setting. The autoscroll still advances, but by so little
      // over this test's frames that it cannot be mistaken for a lost anchor.
      scrollSpeed: 1,
      seedShabadId: 100,
      liveFeed: false,
      activeVerse: verses,
      setActiveVerse: setVerses,
      layoutRevision: 'x',
    });

    page.setOrder(verses.map((verse) => verse.ID));

    return React.createElement(
      'div',
      {
        ref: (node) => {
          if (node) {
            page.attachContainer(node);
          }
          containerRef.current = node;
          contentRef.current = node;
        },
      },
      verses.map((verse) =>
        React.createElement('div', {
          key: verse.ID,
          'data-verseid': String(verse.ID),
          ref: (node) => {
            if (node) {
              page.attachVerse(node, verse.ID);
            }
            verseRefs.current[verse.ID] = node;
          },
        }),
      ),
    );
  };
  /* eslint-enable react/prop-types */

  beforeEach(() => {
    page = createPage();
    // eslint-disable-next-line no-underscore-dangle
    window.__akhandDebug = true;
    // eslint-disable-next-line no-underscore-dangle
    window.__akhandLog = [];
    clock = 1000;
    document.elementFromPoint = (x, y) => page.elementFromPoint(x, y);
    // The settle measures its own window with `performance.now()`, so the test
    // clock has to be the same clock the frames advance.
    nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => clock);
    feed.readShabad.mockImplementation((shabadId) =>
      Promise.resolve({ verses: versesFor(shabadId) }),
    );
    feed.readNextShabad.mockResolvedValue(null);
    feed.readPrevShabad.mockImplementation((headId) =>
      Promise.resolve({ shabadId: headId - 1, verses: versesFor(headId - 1) }),
    );
    frames = takeOverAnimationFrames();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    frames.restore();
    nowSpy.mockRestore();
  });

  const settleMicrotasks = () =>
    act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

  const pumpAt = async (at) => {
    await act(async () => {
      frames.pump(at);
    });
  };

  /** Runs frames, advancing both the frame clock and `performance.now()`. */
  const runFrames = async (count, stepMs = 16) => {
    for (let i = 0; i < count; i += 1) {
      clock += stepMs;
      // eslint-disable-next-line no-await-in-loop
      await pumpAt(clock);
      // eslint-disable-next-line no-await-in-loop
      await settleMicrotasks();
    }
  };

  /** One wheel notch upward, the gesture that asks for the previous Shabad. */
  const wheelUp = async (deltaY = -600) => {
    const container = host.firstChild;
    await act(async () => {
      container.dispatchEvent(
        new window.WheelEvent('wheel', { deltaY, deltaMode: 0, cancelable: true }),
      );
    });
    await settleMicrotasks();
  };

  /** Runs frames until the wheel glide has stopped moving the deck. */
  const runFramesUntilStill = async (limit = 40) => {
    let last = null;
    for (let i = 0; i < limit; i += 1) {
      const at = page.scrollTopNow();
      if (at === last) {
        return;
      }
      last = at;
      // eslint-disable-next-line no-await-in-loop
      await runFrames(1);
    }
  };

  it('keeps the reader still while both prepended Shabads inflate', async () => {
    await act(async () => {
      root.render(React.createElement(Harness));
    });
    await settleMicrotasks();

    // The seeded Shabad is the one the reader is on; give it its real height.
    page.inflate(100);

    // The seed ends in a seek, and a seek holds the scroll for SEEK_SETTLE_MS
    // while late reflow lands. Run past that first, in coarse frames, so the
    // rest of the test happens with the loop free to act on the wheel.
    await runFrames(20, 60);

    // Sit at the top of the content, which is what asks for a previous Shabad.
    page.scrollTo(0);

    // From here frames are a real 16ms apart, so everything below fits inside
    // one ANCHOR_SETTLE_MIN_MS window and neither settle can retire early.
    await wheelUp();
    expect(feed.readPrevShabad).toHaveBeenCalled();
    await runFrames(2);

    // A second notch while the first prepend is still at its mounted height.
    // This is the gesture that crosses two Shabad boundaries in one flick.
    await wheelUp();
    expect(feed.readPrevShabad.mock.calls.length).toBeGreaterThanOrEqual(2);
    await runFrames(2);

    // Let the glide finish so the only thing that can move the deck afterwards
    // is the inflation under test.
    await runFramesUntilStill();

    const readerVerse = verseIdsFor(100)[0];
    const before = page.viewportTopOf(readerVerse);
    expect(before).not.toBeNull();

    // Late reflow lands on the Shabad prepended first. It sits below the second
    // prepend's anchor and above the reader, which is the position an anchor
    // that moved upward can no longer protect.
    page.inflate(99);
    await runFrames(8);

    const after = page.viewportTopOf(readerVerse);
    const drift = Math.abs(after - before);
    // An abandoned anchor shows the whole inflated height of the first
    // prepended Shabad, which is far larger than any residual glide step.
    expect(drift).toBeLessThan(20);
  });

  it('still covers a prepend that arrives near the end of a settle window', async () => {
    await act(async () => {
      root.render(React.createElement(Harness));
    });
    await settleMicrotasks();

    page.inflate(100);
    await runFrames(20, 60);
    page.scrollTo(0);

    await wheelUp();
    expect(feed.readPrevShabad).toHaveBeenCalled();
    await runFrames(2);

    // Hold the first settle open by reflowing its Shabad a little at a time, as
    // a slow font swap does, until the clock is nearly at ANCHOR_SETTLE_MAX_MS.
    // A settle that is never given a fresh window would expire moments after the
    // prepend below, leaving that Shabad's own reflow uncompensated.
    for (let i = 0; i < 8; i += 1) {
      page.grow(99, 4);
      // eslint-disable-next-line no-await-in-loop
      await runFrames(1, 290);
    }

    // A harder flick, because the compensation above has carried the deck away
    // from the top edge in the meantime.
    await wheelUp(-3000);
    expect(feed.readPrevShabad.mock.calls.length).toBeGreaterThanOrEqual(2);
    await runFrames(2);
    await runFramesUntilStill();

    const readerVerse = verseIdsFor(100)[0];
    const before = page.viewportTopOf(readerVerse);
    expect(before).not.toBeNull();

    // Past the point where the first settle's original window would have ended.
    await runFrames(3, 200);
    page.inflate(98);
    await runFrames(8);

    expect(Math.abs(page.viewportTopOf(readerVerse) - before)).toBeLessThan(20);
  });
});
