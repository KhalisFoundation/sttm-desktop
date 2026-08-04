const fs = require('fs');
const path = require('path');

/**
 * The replay to a deck that has just become ready.
 *
 * A deck is a separate renderer with its own copy of the store, kept in step by
 * one-way messages sent as things change. A deck created after a change has
 * missed it and would keep the built-in defaults until the next change. This
 * could leave the operator's pane and the sangat's screen different;
 * `syncViewerState` closes that window by replaying on arrival.
 *
 * What it replays is an explicit list. This compares the replay with the
 * settings the viewer declares and the matched navigator fields it reads.
 *
 * Read from source rather than imported because `GlobalState` pulls in Electron.
 */

const MAIN_DIR = path.join(__dirname, '..', '..', 'www', 'main');

const globalState = fs.readFileSync(
  path.join(MAIN_DIR, 'common', 'store', 'GlobalState.js'),
  'utf8',
);

/**
 * Value keys of the `viewerSettings` slice, taken from its declaration in the
 * store. Actions are declared in the same object literal, so they are filtered
 * out by name.
 */
const declaredSettings = () => {
  const slice = globalState.match(/viewerSettings: \{([\s\S]*?)\n {2}\},\n/);
  expect(slice).not.toBeNull();
  return (slice[1].match(/^ {4}(\w+):/gm) || [])
    .map((line) => line.trim().replace(':', ''))
    .filter((name) => !/^set[A-Z]/.test(name));
};

const syncBody = () => {
  const body = globalState.match(/export const syncViewerState = \(\) => \{([\s\S]*?)\n\};/);
  expect(body).not.toBeNull();
  return body[1];
};

/** The declared list of navigator fields the replay sends. */
const replayedNavigatorFields = () => {
  const block = globalState.match(/const VIEWER_NAVIGATOR_FIELDS = \[([^\]]*)\]/);
  expect(block).not.toBeNull();
  return block[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
};

/** `state.navigator` fields matched in destructuring under `viewer/`. */
const navigatorFieldsTheViewerReads = () => {
  const found = new Set();
  const walk = (dir) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        return;
      }
      if (!/\.jsx?$/.test(entry.name)) {
        return;
      }
      const reads = fs
        .readFileSync(full, 'utf8')
        .matchAll(/const\s*\{([^}]*)\}\s*=\s*useStoreState\(\s*\(state\)\s*=>\s*state\.navigator/g);
      [...reads].forEach((match) => {
        match[1]
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean)
          .forEach((name) => found.add(name));
      });
    });
  };
  walk(path.join(MAIN_DIR, 'viewer'));
  return found;
};

// Panel open/closed state belongs to whichever deck draws the controls. Pushing
// it would open the operator's tool panels on the sangat's screen.
//
// Both spellings: the deck's own store calls these `quickToolsOpen` /
// `paddingToolsOpen`, and those are the ones actually read. The unsuffixed pair
// declared here has no actions and no consumers.
const PANEL_STATE = ['quickTools', 'paddingTools', 'quickToolsOpen', 'paddingToolsOpen'];

describe('syncViewerState', () => {
  describe('layout', () => {
    it('replays every layout setting the store declares', () => {
      const layoutSettings = declaredSettings().filter((name) => !PANEL_STATE.includes(name));
      const body = syncBody();

      expect(layoutSettings.length).toBeGreaterThan(0);
      layoutSettings.forEach((name) => {
        expect(body).toContain(name);
      });
    });

    it('replays no panel state', () => {
      const body = syncBody();
      PANEL_STATE.forEach((name) => {
        expect(body).not.toContain(name);
      });
    });
  });

  /**
   * Navigator state, including the Shabad and verse, reaches a deck through the
   * same messages as layout. A deck opened mid-reading needs those fields in the
   * initial replay because a continuous reading does not require another click.
   */
  describe('the current selection', () => {
    // The control: a scan that found nothing would let both assertions below
    // pass for the wrong reason.
    it('finds the fields the viewer reads', () => {
      expect(navigatorFieldsTheViewerReads().size).toBeGreaterThan(5);
    });

    it('replays every navigator field the viewer renders from', () => {
      const replayed = replayedNavigatorFields();
      navigatorFieldsTheViewerReads().forEach((field) => {
        expect(replayed).toContain(field);
      });
    });

    it('replays nothing the viewer does not read', () => {
      const read = navigatorFieldsTheViewerReads();
      replayedNavigatorFields().forEach((field) => {
        expect(read.has(field)).toBe(true);
      });
    });

    it('sends each field once', () => {
      const replayed = replayedNavigatorFields();
      expect(new Set(replayed).size).toBe(replayed.length);
    });

    /**
     * The replay derives each action name from the field name, which only works
     * because the deck's store generates its actions the same way. If either
     * side stopped, the message would be delivered to `undefined` and throw.
     */
    it('names actions the way the deck generates them', () => {
      const viewerState = fs.readFileSync(
        path.join(MAIN_DIR, 'viewer', 'store', 'ViewerState.js'),
        'utf8',
      );
      // Matched as patterns rather than strings: the text being looked for is
      // itself template-literal syntax.
      expect(viewerState).toMatch(
        /set\$\{stateVarName\.charAt\(0\)\.toUpperCase\(\)\}\$\{stateVarName\.slice\(1\)\}/,
      );
      expect(globalState).toMatch(
        /set\$\{field\.charAt\(0\)\.toUpperCase\(\)\}\$\{field\.slice\(1\)\}/,
      );
    });
  });

  it('is invoked wherever a deck becomes ready', () => {
    // Two decks, created at different moments by different processes: the
    // preview `<webview>` when the navigator mounts, and the presentation
    // window when the operator opens it. Both need the replay.
    const viewerContent = fs.readFileSync(
      path.join(MAIN_DIR, 'navigator', 'viewer', 'ViewerContent.jsx'),
      'utf8',
    );
    const navigatorIndex = fs.readFileSync(path.join(MAIN_DIR, 'index.js'), 'utf8');

    expect(viewerContent).toContain('syncViewerState()');
    expect(navigatorIndex).toContain('syncViewerState()');

    // The preview announces on `dom-ready`, which fires again if the webview is
    // torn down and recreated, so a rebuilt preview is replayed too.
    expect(viewerContent).toContain('dom-ready');

    // The presentation window is opened by the main process, which cannot read
    // the settings, so it asks the main window over this channel.
    const appEntry = fs.readFileSync(path.join(MAIN_DIR, '..', '..', 'app.js'), 'utf8');
    expect(appEntry).toContain("send('viewer-window-ready')");
    expect(navigatorIndex).toContain("on('viewer-window-ready'");
  });
});
