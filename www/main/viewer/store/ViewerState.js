import { createStore, action } from 'easy-peasy';
import GlobalState from '../../common/store/GlobalState';

global.platform = require('../../desktop_scripts');

/* TODO: remove the settingsType argument */
const createSettingsActions = (settingsType) => {
  const userSettingsActions = {};
  Object.keys(GlobalState.getState()[settingsType]).forEach((stateVarName) => {
    // convert state name ex- larivaar to action name ex- setLarivaar
    const stateActionName = `set${stateVarName.charAt(0).toUpperCase()}${stateVarName.slice(1)}`;
    userSettingsActions[stateActionName] = action((state, payload) => {
      // Pane setters are called with a partial object (verse, verses read).
      // Replacing the pane drops activeShabad and blanks Display 2 on the next verse.
      if (/^pane\d+$/.test(stateVarName) && payload && typeof payload === 'object') {
        // Merge by mutating the draft with plain payload values. Spreading and
        // re-storing the draft ({ ...state[pane], ...payload }) retains nested draft
        // references (e.g. versesRead) that get revoked and crash the next
        // production ("get on a revoked proxy"). Payloads are plain (IPC / cloned).
        Object.keys(payload).forEach((key) => {
          // eslint-disable-next-line no-param-reassign
          state[stateVarName][key] = payload[key];
        });
        return;
      }
      // eslint-disable-next-line no-param-reassign
      state[stateVarName] = payload;
    });
  });

  return userSettingsActions;
};

const ViewerState = createStore({
  app: {
    ...GlobalState.getState().app,
    ...createSettingsActions('app'),
  },
  // Create shadow object of user settings from Global State
  userSettings: {
    ...GlobalState.getState().userSettings,
    ...createSettingsActions('userSettings'),
  },
  navigator: {
    ...GlobalState.getState().navigator,
    ...createSettingsActions('navigator'),
  },
  projection: {
    ready: false,
    paneId: null,
    width: 0,
    height: 0,
    range: null,
    // Mutate the draft instead of returning { ...state, ... }. Spreading and
    // returning the draft retains draft references that get revoked and crash the
    // next production ("get on a revoked proxy"). These fire on every pane resize.
    setViewport: action((state, payload) => {
      Object.keys(payload || {}).forEach((key) => {
        // eslint-disable-next-line no-param-reassign
        state[key] = payload[key];
      });
    }),
    setRange: action((state, payload) => {
      // eslint-disable-next-line no-param-reassign
      state.range = payload;
    }),
  },
  viewerSettings: {
    containerPadding: {
      left: 48,
      top: 20,
      right: 0,
      bottom: 0,
    },
    quickToolsOpen: false,
    paddingToolsOpen: false,
    setQuickToolsOpen: action((state, payload) => {
      const newState = state;
      newState.paddingToolsOpen = false; // explictely making sure we are closing the paddingTools when setting the quick tools.
      newState.quickToolsOpen = payload;
      return newState;
    }),
    setPaddingToolsOpen: action((state, payload) => {
      const newState = state;
      newState.quickToolsOpen = false; // explictely making sure we are closing the quickTools when setting the padding tools.
      newState.paddingToolsOpen = payload;
      return newState;
    }),
    setPadding: action((state, payload) => {
      const newState = state;
      newState.containerPadding[payload.type] = payload.value;
      return newState;
    }),
  },
  hydrateProjectionState: action((state, payload) => {
    // Read the active pane from the plain IPC payload (never the immer draft) so no
    // draft reference leaks into the stored state.
    const pn = payload.navigator || {};
    const us = payload.userSettings || {};
    const activePaneId =
      pn.activePaneId || us.defaultPaneId || state.userSettings.defaultPaneId || 1;
    const activePane = pn[`pane${activePaneId}`] || pn.pane1;
    // The controller's top-level versesRead/homeVerse only track the active pane on
    // a pane switch, so they are stale in the snapshot. Display 2 renders ticks and
    // the home icon from these scalars, so seed them from the active pane here or a
    // fresh/swapped window shows no ticks until the next verse change.
    const seeded = {};
    if (activePane) {
      if (Array.isArray(activePane.versesRead)) seeded.versesRead = [...activePane.versesRead];
      if (activePane.homeVerse !== undefined) seeded.homeVerse = activePane.homeVerse;
    }
    // Mutate the draft with plain IPC values (no { ...state } spread-return, which
    // would retain draft references that crash the next production once revoked).
    Object.assign(state.app, payload.app || {});
    Object.assign(state.navigator, pn, seeded);
    Object.assign(state.userSettings, us);
    if (payload.viewport) Object.assign(state.projection, payload.viewport);
    // eslint-disable-next-line no-param-reassign
    state.projection.range = payload.range || state.projection.range;
    // eslint-disable-next-line no-param-reassign
    state.projection.ready = true;
  }),
});

// Whenever a setting is changed in GlobalState, call the respective action here as well.
global.platform.ipc.on('update-viewer-setting', (_event, setting) => {
  const { actionName, payload, settingType } = JSON.parse(setting);
  ViewerState.getActions()[settingType][actionName](payload);
});

global.platform.ipc.on('projection-state', (_event, state) => {
  ViewerState.getActions().hydrateProjectionState(state);
});

global.platform.ipc.on('projection-viewport', (_event, viewport) => {
  ViewerState.getActions().projection.setViewport(viewport);
});

global.platform.ipc.on('projection-range', (_event, range) => {
  ViewerState.getActions().projection.setRange(range);
});

// Display 2 only. Classic Display 1 must not take this path: setIsMiscSlide(false)
// here used to clear a Waheguru / Mool Mantar slide when show-line was resent.
const isPaneProjection =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('paneProjection');

if (isPaneProjection) {
  // easy-peasy/immer hand back the current pane as a draft proxy. Spreading or
  // storing that proxy inside a later setPane makes immer finalize a revoked
  // proxy and crashes the whole Display 2 tree ("Cannot perform 'get' on a proxy
  // that has been revoked"). Always work from a plain clone instead.
  const getPlainPane = (paneId) => {
    const raw = ViewerState.getState().navigator[`pane${paneId}`];
    if (!raw) return null;
    try {
      return JSON.parse(JSON.stringify(raw));
    } catch (err) {
      return null;
    }
  };

  global.platform.ipc.on('show-line', (_event, rawPayload) => {
    const payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
    const navigatorActions = ViewerState.getActions().navigator;

    if (payload?.paneSync && payload.pane && payload.activePaneId) {
      navigatorActions.setActivePaneId(payload.activePaneId);
      if (payload.activeVerseId != null) {
        navigatorActions.setActiveVerseId(payload.activeVerseId);
      }
      // Derive the live scalar ids from the active pane, not from the top-level
      // payload scalars: in multi-pane the controller never updates activeShabadId,
      // so those arrive stale and would clobber the id the projected list follows.
      if (payload.pane.activeShabad != null) {
        if (payload.pane.baniType === 'bani') {
          navigatorActions.setIsCeremonyBani(false);
          navigatorActions.setIsSundarGutkaBani(true);
          navigatorActions.setSundarGutkaBaniId(payload.pane.activeShabad);
        } else if (payload.pane.baniType === 'ceremony') {
          navigatorActions.setIsSundarGutkaBani(false);
          navigatorActions.setIsCeremonyBani(true);
          navigatorActions.setCeremonyId(payload.pane.activeShabad);
        } else {
          navigatorActions.setIsSundarGutkaBani(false);
          navigatorActions.setIsCeremonyBani(false);
          navigatorActions.setActiveShabadId(payload.pane.activeShabad);
        }
      }
      const versesRead = payload.pane.versesRead ? [...payload.pane.versesRead] : [];
      // Ticks + home render from these scalars on Display 2 (plain values, so no
      // store proxy leaks in). The pane copy isn't refreshed on live verse reads.
      navigatorActions.setVersesRead(versesRead);
      if (payload.pane.homeVerse !== undefined) {
        navigatorActions.setHomeVerse(payload.pane.homeVerse);
      }
      const setPane = navigatorActions[`setPane${payload.activePaneId}`];
      const paneState = getPlainPane(payload.activePaneId);
      if (setPane && paneState) {
        setPane({
          ...paneState,
          activeShabad: payload.pane.activeShabad,
          baniType: payload.pane.baniType,
          activeVerse: payload.pane.activeVerse,
          versesRead,
          ...(payload.pane.homeVerse !== undefined ? { homeVerse: payload.pane.homeVerse } : {}),
        });
      }
      return;
    }

    const selectedVerseId = payload?.activeVerseId ?? payload?.Line?.ID ?? null;

    if (selectedVerseId != null) {
      navigatorActions.setActiveVerseId(selectedVerseId);
    }

    // Keep the live shabad/bani ids in step with the verse. The projected list
    // follows these scalars (see MultiPaneContent), so without this a shabad
    // change would move the line but leave Display 2 stuck on the old shabad.
    // Only ShabadText sends shabadId + baniType; misc slides omit them, so they
    // fall through untouched.
    if (payload?.shabadId != null && payload?.baniType) {
      if (payload.baniType === 'bani') {
        navigatorActions.setIsCeremonyBani(false);
        navigatorActions.setIsSundarGutkaBani(true);
        navigatorActions.setSundarGutkaBaniId(payload.shabadId);
      } else if (payload.baniType === 'ceremony') {
        navigatorActions.setIsSundarGutkaBani(false);
        navigatorActions.setIsCeremonyBani(true);
        navigatorActions.setCeremonyId(payload.shabadId);
      } else {
        navigatorActions.setIsSundarGutkaBani(false);
        navigatorActions.setIsCeremonyBani(false);
        navigatorActions.setActiveShabadId(payload.shabadId);
      }
    }

    // Ticks + home render from these scalars on Display 2 (see ShabadText).
    if (payload?.versesRead) {
      navigatorActions.setVersesRead([...payload.versesRead]);
    }
    if (payload?.homeVerse !== undefined) {
      navigatorActions.setHomeVerse(payload.homeVerse);
    }

    if (payload?.currentPane) {
      navigatorActions.setActivePaneId(payload.currentPane);
      const setPane = navigatorActions[`setPane${payload.currentPane}`];
      const paneState = getPlainPane(payload.currentPane);
      if (setPane && paneState && selectedVerseId != null) {
        setPane({
          ...paneState,
          activeVerse: selectedVerseId,
          ...(payload.shabadId != null ? { activeShabad: payload.shabadId } : {}),
          ...(payload.versesRead ? { versesRead: [...payload.versesRead] } : {}),
          ...(payload.homeVerse !== undefined ? { homeVerse: payload.homeVerse } : {}),
        });
      }
    }
  });
}

export default ViewerState;
