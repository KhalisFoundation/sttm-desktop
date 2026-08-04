/**
 * @jest-environment jsdom
 */

/**
 * What a reading does when the database will not answer.
 *
 * A short database outage retries quickly. Longer outages continue with backoff
 * and keep the loading state visible rather than leaving an empty or stale deck.
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
const {
  SEED_RETRY_DELAY_MS,
  SEED_SLOW_RETRY_DELAY_MS,
  SEED_FAST_ATTEMPTS,
} = require('../../../www/main/viewer/akhandpatt/scroll-config');

/* eslint-disable react/prop-types */
const Harness = ({ onSeedState }) => {
  const containerRef = React.useRef(null);
  const contentRef = React.useRef(null);
  const verseRefs = React.useRef({});
  const { seedState } = useAkhandpattScroll({
    containerRef,
    contentRef,
    verseRefs,
    akhandpatt: true,
    infinite: true,
    isPlaying: false,
    scrollSpeed: 100,
    seedShabadId: 100,
    liveFeed: false,
    activeVerse: [],
    setActiveVerse: () => {},
    layoutRevision: 0,
  });
  onSeedState(seedState);
  return React.createElement(
    'div',
    { ref: containerRef },
    React.createElement('div', {
      ref: contentRef,
    }),
  );
};
/* eslint-enable react/prop-types */

describe('a seed the database will not answer', () => {
  let root;
  let host;
  let seedState;

  const open = async () => {
    await act(async () => {
      root.render(
        React.createElement(Harness, {
          onSeedState: (s) => {
            seedState = s;
          },
        }),
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
  };

  /** Lets one scheduled retry fire and its read settle. */
  const advanceOneRetry = async (delay) => {
    await act(async () => {
      jest.advanceTimersByTime(delay);
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    jest.useFakeTimers();
    feed.readShabad.mockResolvedValue(null);
    feed.readNextShabad.mockResolvedValue(null);
    feed.readPrevShabad.mockResolvedValue(null);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    jest.clearAllMocks();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('reports that it is loading from the first attempt', async () => {
    await open();
    expect(seedState).toBe('loading');
  });

  it('retries quickly while the fault could still be a cold database', async () => {
    await open();
    expect(feed.readShabad).toHaveBeenCalledTimes(1);
    await advanceOneRetry(SEED_RETRY_DELAY_MS);
    expect(feed.readShabad).toHaveBeenCalledTimes(2);
    expect(seedState).toBe('loading');
  });

  it('backs off and says so once the quick retries are spent', async () => {
    await open();
    for (let i = 0; i < SEED_FAST_ATTEMPTS; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await advanceOneRetry(SEED_RETRY_DELAY_MS);
    }
    expect(seedState).toBe('stalled');
    expect(feed.readShabad).toHaveBeenCalledTimes(SEED_FAST_ATTEMPTS + 1);
  });

  it('keeps trying after it has backed off, rather than giving up', async () => {
    await open();
    for (let i = 0; i < SEED_FAST_ATTEMPTS; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await advanceOneRetry(SEED_RETRY_DELAY_MS);
    }
    const spent = feed.readShabad.mock.calls.length;

    // Nothing happens at the quick interval any more...
    await advanceOneRetry(SEED_RETRY_DELAY_MS);
    expect(feed.readShabad).toHaveBeenCalledTimes(spent);

    // ...but the heartbeat still comes round.
    await advanceOneRetry(SEED_SLOW_RETRY_DELAY_MS);
    expect(feed.readShabad).toHaveBeenCalledTimes(spent + 1);
    expect(seedState).toBe('stalled');
  });

  it('does not drop back to "loading" on each slow retry', async () => {
    await open();
    for (let i = 0; i < SEED_FAST_ATTEMPTS + 2; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await advanceOneRetry(SEED_SLOW_RETRY_DELAY_MS);
      if (i >= SEED_FAST_ATTEMPTS) {
        expect(seedState).toBe('stalled');
      }
    }
  });

  it('starts reading the moment the database comes back', async () => {
    await open();
    for (let i = 0; i < SEED_FAST_ATTEMPTS + 1; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await advanceOneRetry(SEED_SLOW_RETRY_DELAY_MS);
    }
    expect(seedState).toBe('stalled');

    feed.readShabad.mockResolvedValue({ verses: [{ ID: 1001, Gurmukhi: 'a' }] });
    await advanceOneRetry(SEED_SLOW_RETRY_DELAY_MS);
    expect(seedState).toBe('idle');
  });
});
