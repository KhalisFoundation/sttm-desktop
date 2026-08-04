/**
 * @jest-environment jsdom
 */

/**
 * When a selected verse isn't mounted, is it pruned or just not rendered yet?
 * Getting it wrong silently resumes a reading in the wrong place after a
 * remount. Drives the real hook and reads its decisions back out of the
 * diagnostic trace buffer.
 */
const React = require('react');
const { createRoot } = require('react-dom/client');

// `act` moved from `react-dom/test-utils` to `react` in 18.3. Support both.
// eslint-disable-next-line global-require
const act = React.act || require('react-dom/test-utils').act;

jest.mock('electron', () => ({
  ipcRenderer: { on: () => {}, off: () => {}, send: () => {}, removeListener: () => {} },
}));

// Pulls in `anvaad-js`, which needs a browser global this environment lacks and
// which plays no part in the decision under test.
jest.mock('../../../www/main/navigator/shabad/utils/filter-verse-items', () => ({
  filterRequiredVerseItems: (verses) => verses,
  filterOverlayVerseItems: (verses) => verses,
}));

const SEED_SHABAD = 100;

jest.mock('../../../www/main/viewer/akhandpatt/shabad-feed', () => ({
  readShabad: () =>
    Promise.resolve({
      verses: [
        { ID: 1, Gurmukhi: 'a' },
        { ID: 2, Gurmukhi: 'b' },
        { ID: 3, Gurmukhi: 'c' },
      ],
    }),
  readNextShabad: () => Promise.resolve(null),
  readPrevShabad: () => Promise.resolve(null),
}));

const { useAkhandpattScroll } = require('../../../www/main/viewer/akhandpatt/useAkhandpattScroll');
const {
  forgetReadingPosition,
  rememberReadingPosition,
  recallReadingPosition,
} = require('../../../www/main/viewer/akhandpatt/reading-position');

/*
 * The hook writes its decisions to a diagnostic buffer on `window` (see
 * `scroll-debug.js`), which is the seam this suite observes. The dangling
 * underscores are that module's convention for "not part of any API".
 */
/* eslint-disable no-underscore-dangle */
const startTracing = () => {
  window.__akhandDebug = true;
  window.__akhandLog = [];
};
const stopTracing = () => {
  window.__akhandDebug = false;
  window.__akhandLog = [];
};
const clearTrace = () => {
  window.__akhandLog = [];
};
const trace = () => window.__akhandLog || [];
/* eslint-enable no-underscore-dangle */

const tracedEvents = () => trace().map((entry) => entry.event);

// A test harness has no callers to protect, and its props are declared by the
// only thing that renders it, a few lines below.
/* eslint-disable react/prop-types */
const Harness = (props) => {
  const containerRef = React.useRef(null);
  const contentRef = React.useRef(null);
  const verseRefs = React.useRef(props.mountedVerseRefs || {});
  useAkhandpattScroll({
    containerRef,
    contentRef,
    verseRefs,
    akhandpatt: true,
    infinite: true,
    isPlaying: false,
    scrollSpeed: 10,
    seedShabadId: SEED_SHABAD,
    activeVerseId: props.activeVerseId,
    verseSelectionNonce: props.verseSelectionNonce,
    liveFeed: false,
    activeVerse: [],
    setActiveVerse: () => {},
    layoutRevision: 'x',
    ...props.overrides,
  });
  return React.createElement('div', {
    ref: (node) => {
      containerRef.current = node;
      contentRef.current = node;
    },
  });
};
/* eslint-enable react/prop-types */

/**
 * Mounts a fresh harness. `render` settles the seed load's promise so that
 * assertions see the state the reader would, not a half-loaded one.
 */
const mountHarness = () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);

  const render = async (props) => {
    await act(async () => {
      root.render(React.createElement(Harness, props));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  const unmount = async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  };

  return { render, unmount };
};

describe('deciding whether a selection means "the reader moved"', () => {
  let render;
  let unmount;

  beforeEach(() => {
    startTracing();
    forgetReadingPosition();
    ({ render, unmount } = mountHarness());
  });

  afterEach(async () => {
    await unmount();
    stopTracing();
  });

  it('does not rebuild before verses mount', async () => {
    // A fresh open: the chosen verse is legitimately absent from `verseRefs`,
    // because the seed load has not returned. Treating that as a pruned verse
    // throws away the seed effect's work and, on a remount, the reader's place.
    await render({ activeVerseId: 2, verseSelectionNonce: 7, mountedVerseRefs: {} });

    expect(tracedEvents()).toContain('seed');
    expect(tracedEvents()).not.toContain('reseedForPrunedVerse');
  });

  it('rebuilds the window when the reader selects a verse that has been pruned', async () => {
    await render({ activeVerseId: 2, verseSelectionNonce: 7, mountedVerseRefs: {} });
    clearTrace();

    // A new selection, still nothing mounted for it: this is the pruned case,
    // and the window has to be rebuilt for the line to come back.
    await render({ activeVerseId: 2, verseSelectionNonce: 8, mountedVerseRefs: {} });

    expect(tracedEvents()).toContain('reseedForPrunedVerse');
  });

  it('honours a new selection over the place the reading had drifted to', async () => {
    await render({ activeVerseId: 2, verseSelectionNonce: 7, mountedVerseRefs: {} });
    // The reading scrolls on, so the remembered place is no longer the selection.
    rememberReadingPosition(SEED_SHABAD, SEED_SHABAD, 3);
    clearTrace();

    await render({ activeVerseId: 1, verseSelectionNonce: 8, mountedVerseRefs: {} });

    // Rebuilding from the same seed has the same state as a remount.
    const seeds = trace().filter((entry) => entry.event === 'seed');
    expect(seeds.length).toBeGreaterThan(0);
    expect(seeds[seeds.length - 1].resumed).toBe(false);
  });

  it('resumes a remembered reading on remount instead of discarding it', async () => {
    // What a remount looks like: the same selection as before, a position
    // remembered mid-reading, and nothing rendered yet.
    rememberReadingPosition(SEED_SHABAD, SEED_SHABAD, 3);

    await render({ activeVerseId: 2, verseSelectionNonce: 7, mountedVerseRefs: {} });

    const seed = trace().find((entry) => entry.event === 'seed');
    expect(seed).toBeDefined();
    expect(seed.resumed).toBe(true);
  });

  it('handles each selection nonce once', async () => {
    await render({ activeVerseId: 2, verseSelectionNonce: 7, mountedVerseRefs: {} });
    // A real selection, which rebuilds the window.
    await render({ activeVerseId: 2, verseSelectionNonce: 8, mountedVerseRefs: {} });
    clearTrace();

    // The same selection, but the effect re-runs because the seed moved
    // underneath it. Rebuilding again would restart the window the seed effect
    // is already building, so a handled request must count as spent.
    await render({
      activeVerseId: 2,
      verseSelectionNonce: 8,
      mountedVerseRefs: {},
      overrides: { seedShabadId: SEED_SHABAD + 1 },
    });

    expect(tracedEvents()).not.toContain('reseedForPrunedVerse');
  });
});

/**
 * The other half of the same contract: when a reading has ended, the
 * remembered place must go with it. Left behind, it would later resume a *new*
 * reading of the same Shabad wherever the old one had drifted to, instead of at
 * the selected line.
 */
describe('ending a reading discards where it had got to', () => {
  let render;
  let unmount;

  beforeEach(() => {
    forgetReadingPosition();
    ({ render, unmount } = mountHarness());
  });

  afterEach(async () => {
    await unmount();
  });

  it('when the reader leaves Akhand Paatth view', async () => {
    await render({ activeVerseId: 2, verseSelectionNonce: 7, mountedVerseRefs: {} });
    rememberReadingPosition(SEED_SHABAD, SEED_SHABAD, 3);

    await render({
      activeVerseId: 2,
      verseSelectionNonce: 7,
      mountedVerseRefs: {},
      overrides: { akhandpatt: false },
    });

    expect(recallReadingPosition(SEED_SHABAD)).toBeNull();
  });

  it('when a different Shabad is opened', async () => {
    await render({ activeVerseId: 2, verseSelectionNonce: 7, mountedVerseRefs: {} });
    rememberReadingPosition(SEED_SHABAD, SEED_SHABAD, 3);

    // Opening from search changes the seed without touching the selection
    // nonce, so this exercises the seed effect's own path rather than the
    // rebuild triggered by a navigator click.
    await render({
      activeVerseId: 2,
      verseSelectionNonce: 7,
      mountedVerseRefs: {},
      overrides: { seedShabadId: SEED_SHABAD + 1 },
    });

    expect(recallReadingPosition(SEED_SHABAD)).toBeNull();
  });
});

/**
 * A misc slide (a Quick Insert, announcement, or blank screen) takes the deck off
 * screen without ending the reading. The hook must distinguish this suspension
 * from leaving the view so the reading resumes at its saved position.
 */
describe('raising a misc slide keeps the reading', () => {
  let render;
  let unmount;

  beforeEach(() => {
    forgetReadingPosition();
    ({ render, unmount } = mountHarness());
  });

  afterEach(async () => {
    await unmount();
  });

  it('holds the place while the slide is up', async () => {
    await render({ activeVerseId: 2, verseSelectionNonce: 7, mountedVerseRefs: {} });
    rememberReadingPosition(SEED_SHABAD, SEED_SHABAD, 3);

    // What a Quick Insert looks like from here: the view goes off, but only
    // because something is covering it.
    await render({
      activeVerseId: 2,
      verseSelectionNonce: 7,
      mountedVerseRefs: {},
      overrides: { akhandpatt: false, viewSuspended: true },
    });

    expect(recallReadingPosition(SEED_SHABAD)).toEqual({
      shabadId: SEED_SHABAD,
      verseId: 3,
    });
  });

  it('resumes there when the slide comes down', async () => {
    await render({ activeVerseId: 2, verseSelectionNonce: 7, mountedVerseRefs: {} });
    rememberReadingPosition(SEED_SHABAD, SEED_SHABAD, 3);
    await render({
      activeVerseId: 2,
      verseSelectionNonce: 7,
      mountedVerseRefs: {},
      overrides: { akhandpatt: false, viewSuspended: true },
    });
    startTracing();

    await render({ activeVerseId: 2, verseSelectionNonce: 7, mountedVerseRefs: {} });

    // The outcome, not the presence of a call: the deck reopens at the verse
    // the reading had reached rather than the one it was opened at.
    const seed = trace().find((entry) => entry.event === 'seed');
    stopTracing();
    expect(seed).toBeDefined();
    expect(seed.resumed).toBe(true);
  });

  it('still forgets if the reader leaves the view while the slide is up', async () => {
    await render({ activeVerseId: 2, verseSelectionNonce: 7, mountedVerseRefs: {} });
    rememberReadingPosition(SEED_SHABAD, SEED_SHABAD, 3);
    await render({
      activeVerseId: 2,
      verseSelectionNonce: 7,
      mountedVerseRefs: {},
      overrides: { akhandpatt: false, viewSuspended: true },
    });

    // Switching to slide view behind the misc slide ends the reading, and the
    // deck does not return. The suspension therefore has to lift here.
    await render({
      activeVerseId: 2,
      verseSelectionNonce: 7,
      mountedVerseRefs: {},
      overrides: { akhandpatt: false, viewSuspended: false },
    });

    expect(recallReadingPosition(SEED_SHABAD)).toBeNull();
  });
});
