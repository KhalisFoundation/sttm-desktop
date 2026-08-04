/**
 * @jest-environment jsdom
 */

/**
 * `ArrowIcon` renders the next/previous Shabad arrows in the navigator.
 *
 * This suite renders the real component rather than reading its source. That
 * matters more than usual here: the behaviour under test is a *render*
 * decision, and a source scan for the condition would keep passing if the
 * condition were computed and then never used.
 *
 * React's `act` is used directly. The store, `@electron/remote`, and `banidb`
 * are mocked because they are unavailable outside a running Electron renderer.
 */
const React = require('react');
const { createRoot } = require('react-dom/client');

// React 18.3 exposes `act` from `react`; support earlier versions through
// `react-dom/test-utils`.
// eslint-disable-next-line global-require
const act = React.act || require('react-dom/test-utils').act;

let mockState;

jest.mock('easy-peasy', () => ({
  useStoreState: (selector) => selector(mockState),
  useStoreActions: () => new Proxy({}, { get: () => () => {} }),
}));

jest.mock('@electron/remote', () => ({ require: () => ({ i18n: { t: (key) => key } }) }), {
  virtual: true,
});

jest.mock('../../../www/main/banidb', () => ({}), { virtual: true });

const ArrowIcon = require('../../../www/main/navigator/shabad/ArrowIcon').default;

/** A single-pane workspace showing an ordinary SGGS Shabad: arrows visible. */
const READING_A_SHABAD = {
  navigator: {
    isSundarGutkaBani: false,
    isCeremonyBani: false,
    isMiscSlide: false,
    activeShabadId: 1234,
    activeVerseId: 5678,
    initialVerseId: 5678,
    activePaneId: 1,
    pane1: { baniType: 'shabad', activeShabad: 1234 },
    pane2: { baniType: 'shabad' },
    pane3: { baniType: 'shabad' },
    shortcuts: { nextShabad: false, prevShabad: false },
  },
  // `i18n.t` is mocked to echo its key, so anything but the key is single-pane.
  userSettings: { currentWorkspace: 'Single Pane', akhandpatt: false },
};

const arrowCount = (overrides = {}) => {
  mockState = {
    navigator: { ...READING_A_SHABAD.navigator, ...(overrides.navigator || {}) },
    userSettings: { ...READING_A_SHABAD.userSettings, ...(overrides.userSettings || {}) },
  };

  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(React.createElement(ArrowIcon, { paneId: 1 })));
  const count = host.querySelectorAll('i.fa-arrow-circle-o-left, i.fa-arrow-circle-o-right').length;
  act(() => root.unmount());
  host.remove();
  return count;
};

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
});

describe('ArrowIcon', () => {
  it('offers both arrows on an ordinary Shabad', () => {
    expect(arrowCount()).toBe(2);
  });

  /**
   * The arrows step from `pane.activeShabad`, the operator's last selection. A
   * continuous reading scrolls away from it without
   * changing it, so on a Paatth left running they computed "next" from a
   * position far behind the reading. Clicking one threw it backwards by 62
   * verses after only 70 seconds, and further the longer it had been left alone.
   */
  it('withdraws them while a reading is scrolling continuously', () => {
    expect(arrowCount({ userSettings: { akhandpatt: true } })).toBe(0);
  });

  it('offers them again on a misc slide, where no reading is running', () => {
    expect(
      arrowCount({ userSettings: { akhandpatt: true }, navigator: { isMiscSlide: true } }),
    ).toBe(2);
  });

  it('offers them again before a verse has been chosen', () => {
    expect(
      arrowCount({ userSettings: { akhandpatt: true }, navigator: { activeVerseId: null } }),
    ).toBe(2);
  });

  it.each(['isSundarGutkaBani', 'isCeremonyBani'])(
    'withholds them for a %s, which has no next Shabad',
    (flag) => {
      expect(arrowCount({ navigator: { [flag]: true } })).toBe(0);
    },
  );

  /**
   * Multi Pane renders the arrows from a different branch, which must apply the
   * same reading guard.
   */
  describe('in Multi Pane', () => {
    const MULTI_PANE = { userSettings: { currentWorkspace: 'WORKSPACES.MULTI_PANE' } };

    it('offers both arrows on an ordinary Shabad pane', () => {
      expect(arrowCount(MULTI_PANE)).toBe(2);
    });

    it('withdraws them while a reading is scrolling continuously', () => {
      expect(arrowCount({ userSettings: { ...MULTI_PANE.userSettings, akhandpatt: true } })).toBe(
        0,
      );
    });

    it('offers them again for a finite bani, which the reading never continues', () => {
      expect(
        arrowCount({
          userSettings: { ...MULTI_PANE.userSettings, akhandpatt: true },
          navigator: { isSundarGutkaBani: true },
        }),
      ).toBe(2);
    });
  });
});
