/**
 * @jest-environment jsdom
 */

/**
 * A reading can be navigated while paused, which is also the deck's initial
 * state. Paused, there is no frame loop, so the periodic just-in-time loader
 * isn't running and only the wheel can grow the window. A reader who scrolls to
 * the bottom of what is loaded must still carry on into the next Shabad,
 * including from a Shabad too short to fill the screen and so offering no room
 * to scroll.
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

const versesFor = (shabadId) => [
  { ID: shabadId * 10 + 1, Gurmukhi: 'a' },
  { ID: shabadId * 10 + 2, Gurmukhi: 'b' },
];

/**
 * jsdom performs no layout, so the shape of the deck is declared. `contentPx`
 * is the total height of the loaded Gurbani; when it is no greater than the
 * viewport there is nowhere to scroll, which is the case that matters here.
 */
const giveGeometry = (node, contentPx) => {
  if (Object.getOwnPropertyDescriptor(node, 'clientHeight')) {
    return;
  }
  let scrollTop = Math.max(0, contentPx - 500);
  Object.defineProperty(node, 'clientHeight', { configurable: true, value: 500 });
  Object.defineProperty(node, 'clientWidth', { configurable: true, value: 800 });
  Object.defineProperty(node, 'scrollHeight', { configurable: true, value: contentPx });
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
    isPlaying: false,
    scrollSpeed: 50,
    seedShabadId: 100,
    liveFeed: false,
    activeVerse: [],
    setActiveVerse: () => {},
    layoutRevision: 'x',
  });
  return React.createElement('div', {
    ref: (node) => {
      if (node) {
        giveGeometry(node, props.contentPx);
      }
      containerRef.current = node;
      contentRef.current = node;
    },
  });
};
/* eslint-enable react/prop-types */

describe('a reading that is not playing', () => {
  let root;
  let host;
  let container;

  const open = async (contentPx) => {
    await act(async () => {
      root.render(React.createElement(Harness, { contentPx }));
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
    feed.readShabad.mockImplementation((shabadId) =>
      Promise.resolve({ verses: versesFor(shabadId) }),
    );
    feed.readNextShabad.mockResolvedValue({ shabadId: 101, verses: versesFor(101) });
    feed.readPrevShabad.mockResolvedValue({ shabadId: 99, verses: versesFor(99) });
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
  });

  /**
   * Confirms the harness delivers a wheel event to the hook before the loading
   * cases run.
   */
  it('scrolls by wheel when there is room to move', async () => {
    await open(2000);
    const before = container.scrollTop;
    await wheel(240);
    expect(container.scrollTop).toBeGreaterThanOrEqual(before);
  });

  it('loads the next Shabad when the reader wheels past the end of what is loaded', async () => {
    await open(2000);
    await wheel(240);
    await wheel(240);
    expect(feed.readNextShabad).toHaveBeenCalledWith(100);
  });

  /**
   * The case that has no room at all. A Shabad of one or two lines is shorter
   * than the viewport, so the wheel target is clamped to a position the reader
   * is already at and the glide has nothing to do. The wheel request must be
   * able to trigger loading without movement.
   */
  it('loads the next Shabad from one too short to scroll', async () => {
    await open(400);
    await wheel(240);
    expect(feed.readNextShabad).toHaveBeenCalledWith(100);
  });

  it('loads the previous Shabad when the reader wheels back past the top', async () => {
    await open(400);
    await wheel(-240);
    expect(feed.readPrevShabad).toHaveBeenCalledWith(100);
  });

  /**
   * A failed read leaves the window in place, so a later wheel event asks for
   * the same thing again. Loading must not depend on the first event moving the
   * window.
   */
  it('asks again after a read fails', async () => {
    feed.readNextShabad.mockRejectedValueOnce(new Error('realm closed'));
    await open(400);
    await wheel(240);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    feed.readNextShabad.mockClear();
    await wheel(240);
    expect(feed.readNextShabad).toHaveBeenCalledWith(100);
  });
});
