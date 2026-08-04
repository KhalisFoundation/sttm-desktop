/**
 * @jest-environment jsdom
 */

/**
 * The autoscroll loop is a `requestAnimationFrame` chain, so each frame is
 * responsible for booking the next one. Its body reads layout, syncs across
 * windows and drives the just-in-time loaders, any of which can throw: a revoked
 * Realm proxy, a detached element, or a read that races a prune. If a throw
 * escapes the frame, the next frame is not booked and the scroll stops. A React
 * error boundary cannot catch an error raised inside the callback.
 *
 * So this drives the real hook with a real fault: a container whose
 * `scrollHeight` throws, which is what a detached or revoked element does.
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
  readShabad: () => Promise.resolve({ verses: [{ ID: 1, Gurmukhi: 'a' }] }),
  readNextShabad: () => Promise.resolve(null),
  readPrevShabad: () => Promise.resolve(null),
}));

const { useAkhandpattScroll } = require('../../../www/main/viewer/akhandpatt/useAkhandpattScroll');

/* eslint-disable no-underscore-dangle */
const tracedEvents = () => (window.__akhandLog || []).map((entry) => entry.event);
/* eslint-enable no-underscore-dangle */

/**
 * Drives frames by hand. The loop under test books its own next frame, so this
 * holds the booking queue to check whether it booked one.
 *
 * `pump` arms the injected fault only while the frame callbacks run. Effects
 * also read layout outside a frame, so the fault is limited to the frame body.
 */
const takeOverAnimationFrames = () => {
  const pending = new Map();
  let nextId = 1;
  const realRaf = global.requestAnimationFrame;
  const realCancel = global.cancelAnimationFrame;
  const state = { armed: false };

  global.requestAnimationFrame = (callback) => {
    const id = nextId;
    nextId += 1;
    pending.set(id, callback);
    return id;
  };
  global.cancelAnimationFrame = (id) => pending.delete(id);

  return {
    state,
    booked: () => pending.size,
    /** Runs every currently-booked callback once, at the given timestamp. */
    pump: (timestamp, { faulty = false } = {}) => {
      const due = [...pending.entries()];
      pending.clear();
      state.armed = faulty;
      try {
        due.forEach(([, callback]) => callback(timestamp));
      } finally {
        state.armed = false;
      }
    },
    restore: () => {
      global.requestAnimationFrame = realRaf;
      global.cancelAnimationFrame = realCancel;
    },
  };
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
    seedShabadId: 100,
    liveFeed: false,
    activeVerse: [],
    setActiveVerse: () => {},
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

describe('the autoscroll frame loop', () => {
  let frames;
  let root;
  let host;
  let consoleError;

  beforeEach(async () => {
    // eslint-disable-next-line no-underscore-dangle
    window.__akhandDebug = true;
    // eslint-disable-next-line no-underscore-dangle
    window.__akhandLog = [];
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
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

  const mountWithFaultyContainer = async () => {
    await act(async () => {
      root.render(
        React.createElement(Harness, {
          onContainer: (node) => {
            if (Object.getOwnPropertyDescriptor(node, 'scrollHeight')) {
              return;
            }
            Object.defineProperty(node, 'scrollHeight', {
              configurable: true,
              get() {
                if (frames.state.armed) {
                  throw new Error('scrollHeight of a detached element');
                }
                return 10000;
              },
            });
            Object.defineProperty(node, 'clientHeight', { configurable: true, value: 500 });
          },
        }),
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  /** One faulting frame, wrapped so React flushes whatever it triggers. */
  const pumpFaulty = (time) =>
    act(async () => {
      frames.pump(time, { faulty: true });
    });

  /** Pumps frames until the fault lands, or gives up. Returns whether it landed. */
  const pumpUntilFault = async (limit = 12) => {
    for (let i = 0; i < limit; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await pumpFaulty(1000 + i * 16);
      if (tracedEvents().includes('stepFailed')) {
        return true;
      }
    }
    return false;
  };

  /** Pumps a run of consecutive faulting frames. */
  const pumpFaultyRun = (count, startTime) =>
    Array.from({ length: count }, (unused, i) => startTime + i * 16).reduce(
      (chain, time) => chain.then(() => pumpFaulty(time)),
      Promise.resolve(),
    );

  it('books the next frame even when the frame body throws', async () => {
    await mountWithFaultyContainer();

    expect(await pumpUntilFault()).toBe(true);
    // The property under test: a frame that threw still left a successor booked.
    expect(frames.booked()).toBeGreaterThan(0);
  });

  it('keeps scrolling after a fault clears, rather than staying dead', async () => {
    await mountWithFaultyContainer();
    expect(await pumpUntilFault()).toBe(true);

    const before = frames.booked();
    await act(async () => {
      frames.pump(2000);
    });

    // Still running: the loop survived the fault rather than unwinding.
    expect(before).toBeGreaterThan(0);
    expect(frames.booked()).toBeGreaterThan(0);
  });

  it('reports a broken frame once per loop, not on every frame', async () => {
    await mountWithFaultyContainer();
    expect(await pumpUntilFault()).toBe(true);

    const afterFirstFault = consoleError.mock.calls.length;
    const tracedAfterFirstFault = tracedEvents().filter((event) => event.endsWith('Failed')).length;

    await pumpFaultyRun(8, 2000);

    // Traced every time, so the pattern is visible in a diagnostic session...
    expect(tracedEvents().filter((event) => event.endsWith('Failed')).length).toBeGreaterThan(
      tracedAfterFirstFault,
    );
    // ...but logged once per loop, so a persistent fault cannot flood the console
    // for the length of a 48-hour reading.
    expect(consoleError).toHaveBeenCalledTimes(afterFirstFault);
  });

  it('protects both of the long-lived loops, not just the autoscroll', async () => {
    await mountWithFaultyContainer();
    expect(await pumpUntilFault()).toBe(true);

    await pumpFaultyRun(4, 2000);

    // The autoscroll loop runs only while playing; the anchor loop runs for as
    // long as the deck is open and carries the projection's target. Both absorb
    // a faulting frame rather than dying, and both say so.
    expect(tracedEvents()).toContain('stepFailed');
    expect(tracedEvents()).toContain('syncFailed');
    expect(frames.booked()).toBeGreaterThan(0);
  });
});
