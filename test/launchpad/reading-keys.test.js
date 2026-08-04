/**
 * @jest-environment jsdom
 */

/**
 * What the keyboard does while a continuous reading is on screen.
 *
 * The slide view advances the Gurbani one verse at a time, and the arrows are
 * how the operator does it. A continuous reading advances itself, so the same
 * keys have nothing to step. The selection they would move is the last line the
 * operator clicked, which the reading may have scrolled past.
 *
 * The press is stopped where it is raised rather than where it is acted on,
 * because one press can travel two hops: `Launchpad` raises `nextVerse`,
 * `ShabadText` steps a verse and, at the end of a Shabad, raises `nextShabad`
 * for `ArrowIcon` to act on. Blocking either consumer alone would leave the
 * other reachable.
 *
 * Space is the other key the Launchpad owns. In the slide view it moves to the
 * home verse, which is also how a Quick Insert comes back down. A reading has
 * its own position, so Space plays and pauses it instead. That replacement must
 * retain the route back from a Quick Insert.
 *
 * This renders the real component and dispatches real key events, so it fails
 * if a guard is removed, if a new binding forgets it, or if a guard is computed
 * and then not consulted. Its neighbours (the toolbar, navigator, and add-ons)
 * are stubbed out because none takes part in a key press.
 */
const React = require('react');
const { createRoot } = require('react-dom/client');

// React 18.3 exposes `act` from `react`; support earlier versions through
// `react-dom/test-utils`.
// eslint-disable-next-line global-require
const act = React.act || require('react-dom/test-utils').act;

let mockState;
let mockRaised;

jest.mock('easy-peasy', () => ({
  useStoreState: (selector) => selector(mockState),
  useStoreActions: (selector) =>
    selector({
      navigator: {
        setShortcuts: (value) => mockRaised.push(value),
        setIsMiscSlide: (value) => mockRaised.push({ isMiscSlide: value }),
      },
      app: { setOverlayScreen: () => {} },
      userSettings: { setAutoplayToggle: (value) => mockRaised.push({ autoplayToggle: value }) },
    }),
}));

// Every neighbour is stubbed: none of them takes part in a key press. The stubs
// are written inline because a `jest.mock` factory is hoisted above the file and
// cannot close over a shared one.
jest.mock('../../www/main/toolbar', () => ({ __esModule: true, default: () => null }));
jest.mock('../../www/main/navigator', () => ({ __esModule: true, default: () => null }));
jest.mock('../../www/main/workspace-bar', () => ({ __esModule: true, default: () => null }));
jest.mock('../../www/main/settings/', () => ({ Settings: () => null }));
jest.mock('../../www/main/addons', () => ({
  Ceremonies: () => null,
  SundarGutka: () => null,
  BaniController: () => null,
  LockScreen: () => null,
  AuthDialog: () => null,
  Announcement: () => null,
}));

// `useKeys` is the mechanism under test, so it is the real one; `useSlides`
// reaches for Electron and takes no part in a key press.
jest.mock('../../www/main/common/hooks', () => ({
  // eslint-disable-next-line global-require
  useKeys: require('../../www/main/common/hooks/useKeys').useKeys,
  useSlides: () => ({
    displayWaheguruSlide: () => {},
    displayMoolMantraSlide: () => {},
    displayBlankViewer: () => {},
    displayAnandSahibBhog: () => {},
  }),
}));

jest.mock(
  '@electron/remote',
  () => ({
    require: () => ({ i18n: { t: (key) => key }, openSecondaryWindow: () => {} }),
  }),
  { virtual: true },
);

const Launchpad = require('../../www/main/launchpad/Launchpad').default;

/** An ordinary Shabad in the slide view: the arrows step verses. */
const PRESENTING_SLIDES = {
  app: { overlayScreen: 'none' },
  navigator: {
    shortcuts: { nextVerse: false, prevVerse: false, homeVerse: false },
    isMiscSlide: false,
  },
  userSettings: {
    currentWorkspace: 'Single Pane',
    defaultPaneId: 1,
    akhandpatt: false,
    autoplayToggle: false,
  },
};

/**
 * Mount the Launchpad in the given state, press a key, and report everything
 * the press raised.
 */
const pressing = (code, overrides = {}) => {
  mockState = {
    app: { ...PRESENTING_SLIDES.app, ...(overrides.app || {}) },
    navigator: { ...PRESENTING_SLIDES.navigator, ...(overrides.navigator || {}) },
    userSettings: { ...PRESENTING_SLIDES.userSettings, ...(overrides.userSettings || {}) },
  };
  mockRaised = [];

  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(React.createElement(Launchpad)));
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  });
  act(() => root.unmount());
  host.remove();

  return mockRaised;
};

/** Only the verse-stepping flags a press raised. */
const stepsRaisedBy = (code, overrides) =>
  pressing(code, overrides).filter((update) => update.nextVerse || update.prevVerse);

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
});

describe('stepping the Gurbani with the arrow keys', () => {
  it.each([
    ['ArrowDown', 'nextVerse'],
    ['ArrowRight', 'nextVerse'],
    ['ArrowUp', 'prevVerse'],
    ['ArrowLeft', 'prevVerse'],
  ])('%s steps in the slide view', (code, flag) => {
    expect(stepsRaisedBy(code)).toEqual([expect.objectContaining({ [flag]: true })]);
  });

  it.each(['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'])(
    '%s does nothing while a reading is scrolling',
    (code) => {
      expect(stepsRaisedBy(code, { userSettings: { akhandpatt: true } })).toEqual([]);
    },
  );

  it.each(['ArrowDown', 'ArrowUp'])(
    '%s stays withheld while a misc slide covers the reading',
    (code) => {
      // The reading remains the session and resumes when the slide comes down.
      // Moving the selection behind the slide would cause a jump at that point.
      expect(
        stepsRaisedBy(code, {
          userSettings: { akhandpatt: true },
          navigator: { isMiscSlide: true },
        }),
      ).toEqual([]);
    },
  );
});

describe('Space', () => {
  const READING = { userSettings: { akhandpatt: true } };

  it('asks for the home verse in the slide view', () => {
    expect(pressing('Space')).toEqual([expect.objectContaining({ homeVerse: true })]);
  });

  it('plays and pauses a reading', () => {
    expect(pressing('Space', READING)).toEqual([{ autoplayToggle: true }]);
    expect(
      pressing('Space', {
        userSettings: { akhandpatt: true, autoplayToggle: true },
      }),
    ).toEqual([{ autoplayToggle: false }]);
  });

  it('takes a misc slide down instead of toggling play', () => {
    // Space remains the keyboard route back to the reading while Quick Insert
    // is up.
    expect(pressing('Space', { ...READING, navigator: { isMiscSlide: true } })).toEqual([
      { isMiscSlide: false },
    ]);
  });

  it('leaves the reading where it was when a misc slide comes down', () => {
    // Going through the home verse, as the slide view does, would seek the deck
    // back to the selected line and throw away however far the reading had got.
    const raised = pressing('Space', { ...READING, navigator: { isMiscSlide: true } });
    expect(raised.some((update) => update.homeVerse)).toBe(false);
    expect(raised.some((update) => 'autoplayToggle' in update)).toBe(false);
  });

  it('is inert while an add-on overlay is open', () => {
    expect(pressing('Space', { ...READING, app: { overlayScreen: 'settings' } })).toEqual([]);
  });
});
