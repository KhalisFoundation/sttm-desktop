/**
 * @jest-environment jsdom
 */

/**
 * The Quick Insert tray must survive a re-render of the navigator.
 *
 * `Pane` renders `header`/`content`/`footer` as component *types*, so a footer
 * built inside `MiscPane`'s render body gets a new type every render and React
 * tears it down and rebuilds it. A browser raises `click` only when press and
 * release land on the same element, so a rebuild between them drops the click
 * (and restarts the button's `:hover` and CSS transition). The navigator
 * re-renders for unrelated reasons, so this can't be dodged by keeping quiet.
 *
 * Renders the real `MiscPane`, `Pane`, `PaneFooter` and `MiscFooter` and
 * compares DOM node identity across a parent re-render. `MiscHeader` and
 * `MiscContent` are stubbed.
 */
const React = require('react');
const { createRoot } = require('react-dom/client');
const fs = require('fs');
const path = require('path');

const { declaredProperties, ruleBody } = require('../../helpers/scss-rule');

// React 18.3 exposes `act` from `react`; support earlier versions through
// `react-dom/test-utils`.
// eslint-disable-next-line global-require
const act = React.act || require('react-dom/test-utils').act;

jest.mock('easy-peasy', () => ({
  useStoreState: (selector) =>
    selector({
      app: { overlayScreen: null },
      userSettings: { shortcutTray: true, autoplayToggle: false, defaultPaneId: 1 },
      navigator: {},
    }),
  useStoreActions: () => new Proxy({}, { get: () => () => {} }),
}));

jest.mock(
  '@electron/remote',
  () => ({
    app: { getPath: () => '/tmp' },
    require: () => ({ i18n: { t: (key) => key } }),
    getGlobal: () => ({ trackEvent: () => {} }),
  }),
  { virtual: true },
);

// A leaf utility that reaches the real global store on import; nothing here
// exercises image upload.
jest.mock('../../../www/main/settings/utils/theme-bg-uploader', () => ({
  uploadImage: () => Promise.resolve(),
}));

jest.mock('../../../www/main/navigator/misc/components/MiscHeader', () => ({
  MiscHeader: () => null,
}));
jest.mock('../../../www/main/navigator/misc/components/MiscContent', () => ({
  MiscContent: () => null,
}));

const { MiscPane } = require('../../../www/main/navigator/misc/components/MiscPane');
const Pane = require('../../../www/main/common/sttm-ui/pane/Pane').default;

const trayButtons = (container) => [...container.querySelectorAll('.tray-item-icon')];

/**
 * Render `Component` under a parent this returns a re-render trigger for.
 *
 * The parent builds a fresh element each time, so bumping it re-renders the
 * child. Passing a ready-made element instead would let React bail out on
 * reference equality.
 */
const renderWithRerender = (container, Component) => {
  let bump;
  const Parent = () => {
    const [, setTick] = React.useState(0);
    bump = () => setTick((n) => n + 1);
    return React.createElement(Component);
  };
  const root = createRoot(container);
  act(() => root.render(React.createElement(Parent)));
  return { root, rerender: () => act(() => bump()) };
};

describe('the Quick Insert tray across a navigator re-render', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('keeps its buttons when the navigator re-renders', () => {
    const { root, rerender } = renderWithRerender(container, MiscPane);

    const before = trayButtons(container);
    expect(before.length).toBeGreaterThan(0);

    rerender();
    const after = trayButtons(container);

    expect(after.length).toBe(before.length);
    before.forEach((node, i) => {
      // Node identity, not markup equality: a rebuilt button looks the same but
      // has dropped any press, hover or transition that was in flight.
      expect(after[i]).toBe(node);
    });

    act(() => root.unmount());
  });

  it('remounts buttons when the footer component is inline', () => {
    // A footer defined inline has a new type every render.
    const Footer = () => React.createElement('button', { className: 'tray-item-icon' }, 'x');
    const Inline = () =>
      React.createElement(Pane, {
        header: null,
        content: null,
        footer: () => React.createElement(Footer),
      });

    const { root, rerender } = renderWithRerender(container, Inline);
    const before = trayButtons(container)[0];
    expect(before).toBeDefined();

    rerender();

    expect(trayButtons(container)[0]).not.toBe(before);
    act(() => root.unmount());
  });
});

/**
 * Hovering a tray button must not move the other tray buttons.
 *
 * The drawer lays its buttons out with `space-evenly` and sizes each to its own
 * content, so the row's geometry is a function of every button's box. Growing
 * the hovered button's box therefore re-runs the row's layout and shifts its
 * neighbours sideways as the cursor crosses it.
 *
 * Growing it with a transform has the same visual effect and no layout cost: a
 * transform is applied when the element is painted, after its box has been
 * placed, so the row is laid out identically hovered or not.
 */
describe('the Quick Insert tray hover', () => {
  // Properties that are resolved at paint time and so cannot move a sibling.
  // Anything not listed here participates in layout; add to this list only
  // after checking that the property cannot affect the row's boxes.
  const PAINT_ONLY = [
    'transform',
    'background',
    'background-color',
    'color',
    'box-shadow',
    'opacity',
    'filter',
  ];

  const hoverBody = () => {
    const scss = fs.readFileSync(
      path.join(__dirname, '../../../www/src/scss/navigator/misc/_misc.scss'),
      'utf8',
    );
    // The first `.tray-item-icon` is the one inside the open drawer; the later
    // one only hides the buttons while the drawer is shut.
    return ruleBody(ruleBody(scss, '.tray-item-icon'), '&:hover');
  };

  it('changes nothing that participates in layout', () => {
    const properties = declaredProperties(hoverBody());

    expect(properties.length).toBeGreaterThan(0);
    properties.forEach((property) => {
      expect(PAINT_ONLY).toContain(property);
    });
  });

  it('still enlarges the button', () => {
    expect(hoverBody()).toMatch(/transform:\s*scale\(/);
  });
});
