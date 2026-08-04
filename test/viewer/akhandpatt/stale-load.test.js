/**
 * @jest-environment jsdom
 */

/**
 * Loading the next Shabad is a database read, and the reader can pick a
 * different Shabad while it is in flight. The loaders re-check the window
 * boundary before appending, a guard that never fires unless the read is held
 * open. So this holds the read open, moves the reader, then lets it finish.
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

/* eslint-disable no-underscore-dangle */
const tracedEvents = () => (window.__akhandLog || []).map((entry) => entry.event);
/* eslint-enable no-underscore-dangle */

const versesFor = (shabadId) => [
  { ID: shabadId * 10 + 1, Gurmukhi: 'a' },
  { ID: shabadId * 10 + 2, Gurmukhi: 'b' },
];

/** A promise the test finishes by hand, so the read can be held open. */
const deferred = () => {
  let settle;
  const promise = new Promise((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
};

/**
 * Holds the frame queue so the test can advance time. The just-in-time
 * loaders are sampled on an interval, so a load only happens if the test lets
 * enough time pass between frames.
 */
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

/**
 * Gives the container geometry that puts the reader within `LOAD_AHEAD_SCREENS`
 * of the bottom, which is what asks for the next Shabad. jsdom performs no
 * layout, so every dimension has to be declared.
 */
const giveGeometry = (node) => {
  if (Object.getOwnPropertyDescriptor(node, 'clientHeight')) {
    return;
  }
  let scrollTop = 900;
  Object.defineProperty(node, 'clientHeight', { configurable: true, value: 500 });
  Object.defineProperty(node, 'clientWidth', { configurable: true, value: 800 });
  Object.defineProperty(node, 'scrollHeight', { configurable: true, value: 1400 });
  Object.defineProperty(node, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (value) => {
      scrollTop = value;
    },
  });
};

/* eslint-disable react/prop-types */
const Harness = (props) => {
  const containerRef = React.useRef(null);
  const contentRef = React.useRef(null);
  const verseRefs = React.useRef({});
  useAkhandpattScroll({
    containerRef,
    contentRef,
    verseRefs,
    akhandpatt: true,
    infinite: true,
    isPlaying: true,
    scrollSpeed: 50,
    seedShabadId: props.seedShabadId,
    liveFeed: false,
    activeVerse: [],
    setActiveVerse: () => {},
    layoutRevision: 'x',
  });
  return React.createElement('div', {
    ref: (node) => {
      if (node) {
        giveGeometry(node);
      }
      containerRef.current = node;
      contentRef.current = node;
    },
  });
};
/* eslint-enable react/prop-types */

describe('a Shabad read that finishes after the reader has moved on', () => {
  let frames;
  let root;
  let host;
  let consoleError;

  beforeEach(() => {
    // eslint-disable-next-line no-underscore-dangle
    window.__akhandDebug = true;
    // eslint-disable-next-line no-underscore-dangle
    window.__akhandLog = [];
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    feed.readShabad.mockImplementation((shabadId) =>
      Promise.resolve({ verses: versesFor(shabadId) }),
    );
    feed.readPrevShabad.mockResolvedValue(null);
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
    consoleError.mockRestore();
    // eslint-disable-next-line no-underscore-dangle
    window.__akhandDebug = false;
  });

  let clock = 0;

  const show = async (seedShabadId) => {
    await act(async () => {
      root.render(React.createElement(Harness, { seedShabadId }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // The loop starts its clock from `performance.now()`, so frames must be
    // timestamped from there too; counting up from zero produces negative
    // deltas and the sample interval is never reached.
    clock = Math.max(clock, performance.now());
  };

  /**
   * Runs enough frames to cross the just-in-time sample interval. Each frame is
   * clamped to `MAX_FRAME_DELTA_SECONDS` however long the gap, so this is a
   * count of frames rather than a jump in the clock.
   */
  const readOn = async (frameCount = 8) => {
    await act(async () => {
      for (let i = 0; i < frameCount; i += 1) {
        clock += 60;
        frames.pump(clock);
      }
    });
  };

  /**
   * Confirms that the harness observes an append before testing discarded
   * results.
   */
  test('is appended when the reader has stayed put', async () => {
    const next = deferred();
    feed.readNextShabad.mockReturnValue(next.promise);

    await show(100);
    await readOn();
    expect(feed.readNextShabad).toHaveBeenCalledWith(100);

    await act(async () => {
      next.settle({ shabadId: 101, verses: versesFor(101) });
      await Promise.resolve();
    });

    expect(tracedEvents()).toContain('append');
  });

  test('is discarded when the reader has opened something else', async () => {
    const next = deferred();
    feed.readNextShabad.mockReturnValue(next.promise);

    await show(100);
    await readOn();
    expect(feed.readNextShabad).toHaveBeenCalledWith(100);

    // The reader chooses a different Shabad while the read is still open.
    await show(200);
    // eslint-disable-next-line no-underscore-dangle
    window.__akhandLog = [];

    await act(async () => {
      next.settle({ shabadId: 101, verses: versesFor(101) });
      await Promise.resolve();
    });

    expect(tracedEvents()).not.toContain('append');
  });

  /**
   * A read that fails must not be mistaken for "there is nothing after this".
   * Latching the end flag would stop the reading at the failed verse until the
   * Shabad was reopened.
   */
  test('does not seal off the reading when a read fails', async () => {
    feed.readNextShabad.mockRejectedValue(new Error('realm closed'));

    await show(100);
    await readOn();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(tracedEvents()).toContain('appendFailed');

    // The next sample must be free to try again.
    feed.readNextShabad.mockResolvedValue({ shabadId: 101, verses: versesFor(101) });
    await readOn();
    await act(async () => {
      await Promise.resolve();
    });

    expect(tracedEvents()).toContain('append');
  });

  /**
   * The three tests above all let the replacement seed finish before releasing
   * the stale read. That is only one of the two orderings, and it is the safe
   * one: by the time the stale result arrives the window has already been
   * rebuilt, so the boundary it checks has moved and it discards itself.
   *
   * These hold the seed open as well, so the stale result lands in the gap
   * between "the reader has chosen something else" and "the new window exists".
   * In that gap the old window is still the current one, so a check against the
   * window alone cannot tell the two readings apart.
   */
  describe('while the replacement reading is itself still loading', () => {
    /** Lets `readShabad` be held open per seed id, so the gap can be entered. */
    const deferSeed = () => {
      const pending = new Map();
      feed.readShabad.mockImplementation((shabadId) => {
        const held = deferred();
        pending.set(shabadId, () => held.settle({ verses: versesFor(shabadId) }));
        return held.promise;
      });
      return {
        release: async (shabadId) => {
          await act(async () => {
            pending.get(shabadId)();
            await Promise.resolve();
            await Promise.resolve();
          });
        },
      };
    };

    /** Unlike `show`, this does not await the seed read. */
    const choose = async (seedShabadId) => {
      await act(async () => {
        root.render(React.createElement(Harness, { seedShabadId }));
      });
    };

    test('a stale append is discarded', async () => {
      const next = deferred();
      feed.readNextShabad.mockReturnValue(next.promise);

      await show(100);
      await readOn();
      expect(feed.readNextShabad).toHaveBeenCalledWith(100);

      const seeds = deferSeed();
      await choose(200);
      // eslint-disable-next-line no-underscore-dangle
      window.__akhandLog = [];

      await act(async () => {
        next.settle({ shabadId: 101, verses: versesFor(101) });
        await Promise.resolve();
      });

      expect(tracedEvents()).not.toContain('append');
      await seeds.release(200);
    });

    /**
     * The damaging variant. A stale read that reports the source has ended
     * would latch the end flag, and the seed's success path does not clear it.
     * The replacement reading would then stop at the end of its own Shabad.
     */
    test('a stale end-of-source does not seal off the replacement reading', async () => {
      const next = deferred();
      feed.readNextShabad.mockReturnValue(next.promise);

      await show(100);
      await readOn();

      const seeds = deferSeed();
      await choose(200);

      await act(async () => {
        next.settle(null);
        await Promise.resolve();
      });

      await seeds.release(200);
      feed.readNextShabad.mockReturnValue(deferred().promise);
      feed.readNextShabad.mockClear();
      await readOn();

      expect(feed.readNextShabad).toHaveBeenCalledWith(200);
    });

    /**
     * The seed marks itself as loading so nothing else reads while the window
     * is being built. A stale continuation settling in the gap must not clear
     * that mark on the seed's behalf.
     */
    test('a stale read does not release the replacement seed\u2019s loading mark', async () => {
      const next = deferred();
      feed.readNextShabad.mockReturnValue(next.promise);

      await show(100);
      await readOn();

      const seeds = deferSeed();
      await choose(200);

      await act(async () => {
        next.settle({ shabadId: 101, verses: versesFor(101) });
        await Promise.resolve();
      });

      feed.readNextShabad.mockClear();
      await readOn();

      // The window does not exist yet, so nothing may be read for it.
      expect(feed.readNextShabad).not.toHaveBeenCalled();
      await seeds.release(200);
    });
  });
});
