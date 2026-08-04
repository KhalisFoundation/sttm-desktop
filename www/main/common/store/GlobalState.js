/* eslint-disable no-param-reassign */
import { createStore, action } from 'easy-peasy';

import { DEFAULT_LINE_SPACING, DEFAULT_OVERLAY, DEFAULT_VERSE_SPACING } from '../constants';

import createUserSettingsState from './user-settings/create-user-settings-state';
import createNavigatorSettingsState from './navigator-settings/create-navigator-settings';

import { savedSettings, userConfigPath } from './user-settings/get-saved-user-settings';
import { savedOverlaySettings } from './user-settings/get-saved-overlay-settings';

import createOverlaySettingsState from './user-settings/create-overlay-settings-state';

const { sidebar, bottomBar } = require('../../../configs/overlay.json');
const { settings } = require('../../../configs/user-settings.json');
const navigatorSettings = require('../../../configs/navigator-settings.json');

global.platform = require('../../desktop_scripts');

/**
 * NOTE ON ACTIONS: an `action()` must mutate its Immer draft in place and return
 * NOTHING. Returning the draft makes easy-peasy assign it back onto the
 * *previous* committed state and then revoke it (see `simpleProduce` in
 * easy-peasy/dist), leaving a revoked proxy in the state tree. Every subsequent
 * dispatch then throws "Cannot perform 'get' on a proxy that has been revoked".
 * Buttons and shortcuts stop responding while non-React handlers (e.g. the
 * viewer's native wheel listener) keep working. Enforced by
 * `test/store/no-draft-return.test.js`.
 */

/**
 * Push a store change out to both deck instances: the in-app preview `<webview>`
 * and, via the main process, the external presentation window. This keeps the
 * operator's pane and the sangat's screen laid out identically.
 *
 * `settingType` names the slice of the deck's own store to apply it to; see
 * `ViewerState`, which mirrors these slices and generates the actions.
 */
const sendToDecks = (settingType, actionName, payload) => {
  const message = JSON.stringify({ payload, actionName, settingType });

  if (global.webview) {
    global.webview.send('update-viewer-setting', message);
  }

  if (global.platform) {
    global.platform.ipc.send('update-viewer-setting', message);
  }
};

const broadcastViewerSetting = (actionName, payload) =>
  sendToDecks('viewerSettings', actionName, payload);

const GlobalState = createStore({
  app: {
    overlayScreen: DEFAULT_OVERLAY,
    isListeners: false,
    userToken: '',
    setOverlayScreen: action((state, payload) => {
      state.overlayScreen = payload;
    }),
    setListeners: action((state, listenersState) => {
      state.isListeners = listenersState;
    }),
    setUserToken: action((state, payload) => {
      state.userToken = payload;
    }),
  },
  baniController: {
    adminPin: null,
    code: null,
    isConnected: false,
    setAdminPin: action((state, adminPin) => {
      state.adminPin = adminPin;
    }),
    setCode: action((state, code) => {
      state.code = code;
    }),
    setConnection: action((state, connectionState) => {
      state.isConnected = connectionState;
    }),
  },
  navigator: createNavigatorSettingsState(navigatorSettings),
  viewerSettings: {
    containerPadding: {
      left: 48,
      top: 20,
      right: 0,
      bottom: 0,
    },
    // Akhand Paatth spacing, in reference-design pixels (see `_verse-slide.scss`).
    // `verseSpacing` is the air around a verse and so sets the gap between verses;
    // `lineSpacing` is the gap between the lines within one. Both sit beside
    // `containerPadding` as viewer layout preferences adjusted live from the
    // deck, so they inherit the Settings page's reset button.
    verseSpacing: DEFAULT_VERSE_SPACING,
    lineSpacing: DEFAULT_LINE_SPACING,
    quickTools: false,
    paddingTools: false,
    setPadding: action((state, payload) => {
      broadcastViewerSetting('setPadding', payload);
      state.containerPadding[payload.type] = payload.value;
    }),
    setVerseSpacing: action((state, payload) => {
      broadcastViewerSetting('setVerseSpacing', payload);
      state.verseSpacing = payload;
    }),
    setLineSpacing: action((state, payload) => {
      broadcastViewerSetting('setLineSpacing', payload);
      state.lineSpacing = payload;
    }),
  },
  userSettings: createUserSettingsState(settings, savedSettings, userConfigPath),
  baniOverlay: createOverlaySettingsState(
    { ...sidebar.settings, ...bottomBar.settings },
    savedOverlaySettings,
    userConfigPath,
  ),
});

global.platform.ipc.on('update-global-setting', (_event, setting) => {
  const { settingType, actionName, payload } = JSON.parse(setting);
  GlobalState.getActions()[settingType][actionName](payload);
});

global.platform.ipc.on('get-overlay-prefs', () => {
  const overlayState = GlobalState.getState().baniOverlay;
  global.platform.ipc.send('save-overlay-settings', JSON.stringify(overlayState));
});

global.platform.ipc.on('userToken', (event, data) => {
  const currentToken = GlobalState.getState().app.userToken;
  if (data !== currentToken) {
    GlobalState.getActions().app.setUserToken(data);
  }
});

/**
 * The navigator fields a deck renders from.
 *
 * Navigator changes are pushed as they happen (see `createNavigatorSettings`),
 * so a deck only ever holds what it was told after it existed. That is enough
 * in the slide view, where the operator's next click brings a late window up to
 * date within seconds. A continuous reading has no next click: it can run for
 * hours untouched, so a deck that came up mid-reading (for example, a newly
 * connected projector or re-opened presentation window) would keep the built-in
 * defaults, with no Shabad and no verse, until the reading ended.
 *
 * Only what the deck renders from is replayed. The rest of the navigator slice
 * is the operator's own working state (search results, history, favourites) and
 * has no bearing on what the sangat sees. `test/viewer/viewer-state-replay`
 * compares this list with the fields the viewer subtree reads.
 */
const VIEWER_NAVIGATOR_FIELDS = [
  'activeShabadId',
  'activePaneId',
  'activeVerseId',
  'verseSelectionNonce',
  'isMiscSlide',
  'isMiscSlideGurmukhi',
  'isAnnouncement',
  'miscSlideText',
  'sundarGutkaBaniId',
  'isSundarGutkaBani',
  'ceremonyId',
  'isCeremonyBani',
  'minimizedBySingleDisplay',
  'disabledContent',
  'filteredBaniOptions',
  'pane1',
  'pane2',
  'pane3',
];

/**
 * Bring a deck that has just become ready up to date with the live session.
 *
 * Changes are pushed one at a time as they happen, so a deck created *after* an
 * adjustment never saw it and starts at the built-in defaults. This can leave
 * the operator's pane and the sangat's screen showing different things. Decks
 * are created on demand (the preview when the navigator mounts, the presentation
 * window when the operator opens one, or when a display is plugged in), so
 * replaying on arrival closes that window.
 *
 * Of the layout slice only layout is replayed: `quickToolsOpen` and
 * `paddingToolsOpen` are the operator's own panel state, meaningful solely to
 * the deck drawing those controls, and pushing them would open panels on the
 * sangat's screen.
 *
 * Padding is per-edge, so it replays through the same `{ type, value }` payload
 * `PaddingTools` sends.
 */
export const syncViewerState = () => {
  const state = GlobalState.getState();
  const { containerPadding, verseSpacing, lineSpacing } = state.viewerSettings;

  Object.entries(containerPadding).forEach(([type, value]) => {
    broadcastViewerSetting('setPadding', { type, value });
  });
  broadcastViewerSetting('setVerseSpacing', verseSpacing);
  broadcastViewerSetting('setLineSpacing', lineSpacing);

  VIEWER_NAVIGATOR_FIELDS.forEach((field) => {
    const actionName = `set${field.charAt(0).toUpperCase()}${field.slice(1)}`;
    sendToDecks('navigator', actionName, state.navigator[field]);
  });
};

export default GlobalState;
