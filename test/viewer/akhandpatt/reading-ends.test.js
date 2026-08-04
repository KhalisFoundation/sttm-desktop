/**
 * @jest-environment jsdom
 */

/**
 * Two ways a reading can come to a stop without saying so.
 *
 * The first is reaching the end of the Gurbani. The scroll comes to rest at the
 * bottom, which looks like a stalled reading unless the deck is notified. The
 * deck then puts the control back to "start".
 *
 * The second is a fault inside the wheel glide. The glide books its own next
 * frame and a new gesture only starts one when none is booked, so a throw that
 * escapes leaves the frame handle set for ever and the wheel stops responding
 * for the rest of the session, with no way back short of restarting the app.
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

/** Frames are driven by hand: the loop books its own next one. */
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
    booked: () => pending.size,
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

const versesFor = (shabadId) => [
  { ID: shabadId * 10 + 1, Gurmukhi: 'a' },
  { ID: shabadId * 10 + 2, Gurmukhi: 'b' },
];

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
    isPlaying: props.isPlaying,
    scrollSpeed: 100,
    seedShabadId: 100,
    liveFeed: false,
    activeVerse: [],
    setActiveVerse: () => {},
    onReadingEnded: props.onReadingEnded,
    layoutRevision: 'x',
  });
  return React.createElement('div', {
    ref: (node) => {
      if (node && props.onContainer) {
        props.onContainer(node);
      }
      containerRef.current = node;
      contentRef.current = node;
    },
  });
};
/* eslint-enable react/prop-types */

describe('a reading that comes to a stop', () => {
  let frames;
  let root;
  let host;
  let onReadingEnded;

  /** jsdom performs no layout, so the deck's shape is declared. */
  const shapeDeck = (node, { contentPx, scrollTop }) => {
    if (Object.getOwnPropertyDescriptor(node, 'clientHeight')) {
      return;
    }
    let position = scrollTop;
    let height = contentPx;
    Object.defineProperty(node, 'clientHeight', { configurable: true, value: 500 });
    Object.defineProperty(node, 'clientWidth', { configurable: true, value: 800 });
    Object.defineProperty(node, 'scrollHeight', {
      configurable: true,
      get: () => height,
      set: (value) => {
        height = value;
      },
    });
    Object.defineProperty(node, 'scrollTop', {
      configurable: true,
      get: () => position,
      set: (value) => {
        position = value;
      },
    });
  };

  const open = async ({ contentPx, scrollTop, isPlaying = true, endOfSource = true }) => {
    feed.readShabad.mockResolvedValue({ verses: versesFor(100) });
    feed.readNextShabad.mockResolvedValue(
      endOfSource ? null : { shabadId: 101, verses: versesFor(101) },
    );
    feed.readPrevShabad.mockResolvedValue(null);
    await act(async () => {
      root.render(
        React.createElement(Harness, {
          isPlaying,
          onReadingEnded,
          onContainer: (node) => shapeDeck(node, { contentPx, scrollTop }),
        }),
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  /**
   * Runs frames at 100 ms apart, which is longer than the loop's clamp on a
   * frame delta, so each frame contributes the maximum. The just-in-time loader
   * samples every `JIT_SAMPLE_INTERVAL` (0.2 s of clamped time, so every fourth
   * frame). Timestamps continue from the real clock the loop started on: a
   * timestamp before that origin would produce a negative delta and wind the
   * loop's own counters backwards.
   */
  const run = async (frameCount) => {
    const origin = performance.now();
    const { pump } = frames;
    for (let i = 1; i <= frameCount; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        pump(origin + i * 100);
        await Promise.resolve();
      });
    }
  };

  beforeEach(() => {
    // jsdom has no hit-testing. The overlay sync is guarded and treats a miss as
    // "no verse under the centre", which is the right answer for a headless DOM.
    document.elementFromPoint = () => null;
    onReadingEnded = jest.fn();
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
    jest.clearAllMocks();
  });

  it('says nothing while there is still Gurbani to come', async () => {
    await open({ contentPx: 10000, scrollTop: 9500, endOfSource: false });
    await run(6);
    expect(onReadingEnded).not.toHaveBeenCalled();
  });

  it('says nothing while it is still scrolling towards the end', async () => {
    await open({ contentPx: 10000, scrollTop: 0 });
    await run(6);
    expect(onReadingEnded).not.toHaveBeenCalled();
  });

  it('tells the deck when it has run out of Gurbani at the bottom', async () => {
    await open({ contentPx: 900, scrollTop: 400 });
    await run(6);
    expect(onReadingEnded).toHaveBeenCalled();
  });

  it('tells the deck only once', async () => {
    await open({ contentPx: 900, scrollTop: 400 });
    await run(12);
    expect(onReadingEnded).toHaveBeenCalledTimes(1);
  });

  it('says nothing when the reading is paused', async () => {
    await open({ contentPx: 900, scrollTop: 400, isPlaying: false });
    await run(6);
    expect(onReadingEnded).not.toHaveBeenCalled();
  });

  // The reader can wheel back up, and a bottom prune reopens the source, so the
  // latch has to release rather than seal the reading off after one report.
  // Growing the deck below the scroll is what that looks like from here.
  it('reports the end again once there is content below and then none', async () => {
    await open({ contentPx: 900, scrollTop: 400 });
    await run(8);
    expect(onReadingEnded).toHaveBeenCalledTimes(1);

    const deck = host.firstChild;
    deck.scrollHeight = 4000;
    await run(4);
    expect(onReadingEnded).toHaveBeenCalledTimes(1);

    deck.scrollHeight = 900;
    await run(4);
    expect(onReadingEnded).toHaveBeenCalledTimes(2);
  });
});

describe('a fault inside the wheel glide', () => {
  let frames;
  let root;
  let host;
  let container;
  let faulty;
  const open = async () => {
    feed.readShabad.mockResolvedValue({ verses: versesFor(100) });
    feed.readNextShabad.mockResolvedValue(null);
    feed.readPrevShabad.mockResolvedValue(null);
    await act(async () => {
      root.render(
        React.createElement(Harness, {
          isPlaying: false,
          onContainer: (node) => {
            if (Object.getOwnPropertyDescriptor(node, 'clientHeight')) {
              return;
            }
            let position = 0;
            Object.defineProperty(node, 'clientHeight', { configurable: true, value: 500 });
            Object.defineProperty(node, 'clientWidth', { configurable: true, value: 800 });
            Object.defineProperty(node, 'scrollHeight', { configurable: true, value: 10000 });
            Object.defineProperty(node, 'scrollTop', {
              configurable: true,
              get: () => {
                if (faulty) {
                  throw new Error('scrollTop of a detached element');
                }
                return position;
              },
              set: (value) => {
                position = value;
              },
            });
          },
        }),
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    container = host.firstChild;
  };

  const wheel = async (deltaY) => {
    await act(async () => {
      container.dispatchEvent(
        new window.WheelEvent('wheel', { deltaY, deltaMode: 0, cancelable: true, bubbles: false }),
      );
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    document.elementFromPoint = () => null;
    faulty = false;
    frames = takeOverAnimationFrames();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    faulty = false;
    await act(async () => {
      root.unmount();
    });
    host.remove();
    frames.restore();
    jest.clearAllMocks();
  });

  it('books a glide frame for a healthy gesture', async () => {
    await open();
    const before = frames.booked();
    await wheel(120);
    expect(frames.booked()).toBeGreaterThan(before);
  });

  // A window only defers to another when it has actually heard from one. The
  // clock this is judged against counts from the moment the document loaded, so
  // treating "no anchor yet" as time zero would make every freshly-opened deck
  // ignore the wheel until it was a second old. The clock is held at ten
  // milliseconds here so the condition is reproduced rather than waited for.
  it('honours the wheel in the first second after the deck opens', async () => {
    const realNow = performance.now.bind(performance);
    const loadedAt = realNow();
    const clock = jest
      .spyOn(performance, 'now')
      .mockImplementation(() => realNow() - loadedAt + 10);
    try {
      await open();
      const before = frames.booked();
      await wheel(120);
      expect(frames.booked()).toBeGreaterThan(before);
    } finally {
      clock.mockRestore();
    }
  });

  // A glide that never releases its frame handle books a new frame for ever,
  // holding the compositor awake long after the gesture is over. On a machine
  // driving a projector that is a real cost, and it is invisible: the scroll has
  // already stopped moving, so nothing on screen says the loop is still running.
  it('stops booking frames once the gesture has landed', async () => {
    await open();
    const idle = frames.booked();
    await wheel(120);
    expect(frames.booked()).toBeGreaterThan(idle);

    const origin = performance.now();
    const { pump } = frames;
    let framesToSettle = null;
    for (let i = 1; i <= 200 && framesToSettle === null; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        pump(origin + i * 16);
        await Promise.resolve();
      });
      if (frames.booked() === idle) {
        framesToSettle = i;
      }
    }
    expect(framesToSettle).not.toBeNull();
  });

  it('lets the next gesture start a fresh glide after a frame throws', async () => {
    await open();
    await wheel(120);

    faulty = true;
    await act(async () => {
      frames.pump(1000);
      await Promise.resolve();
    });
    faulty = false;

    // The wheel is only usable again if the faulted glide released the frame
    // handle it was holding.
    const before = frames.booked();
    await wheel(120);
    expect(frames.booked()).toBeGreaterThan(before);
  });
});
