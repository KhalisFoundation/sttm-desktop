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
    setViewport: action((state, payload) => ({ ...state, ...payload })),
    setRange: action((state, payload) => ({ ...state, range: payload })),
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
  hydrateProjectionState: action((state, payload) => ({
    ...state,
    app: { ...state.app, ...payload.app },
    navigator: { ...state.navigator, ...payload.navigator },
    userSettings: { ...state.userSettings, ...payload.userSettings },
    projection: {
      ...state.projection,
      ...payload.viewport,
      range: payload.range || state.projection.range,
      ready: true,
    },
  })),
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

global.platform.ipc.on('show-line', (_event, payload) => {
  // Display 2: always push active verse so highlight + scroll track the controller.
  const selectedVerseId = payload?.activeVerseId ?? payload?.Line?.ID ?? null;
  const navigatorActions = ViewerState.getActions().navigator;

  if (selectedVerseId != null) {
    navigatorActions.setActiveVerseId(selectedVerseId);
  }
  navigatorActions.setIsMiscSlide(false);

  if (payload?.currentPane) {
    navigatorActions.setActivePaneId(payload.currentPane);
    const setPane = navigatorActions[`setPane${payload.currentPane}`];
    const paneState = ViewerState.getState().navigator[`pane${payload.currentPane}`];
    if (setPane && paneState && selectedVerseId != null) {
      const nextPane = {
        ...paneState,
        activeVerse: selectedVerseId,
      };
      // Keep projected pane shabad/bani in sync when the controller switches panes.
      if (payload.shabadId != null) {
        nextPane.activeShabad = payload.shabadId;
      }
      setPane(nextPane);
    }
  }

  if (!payload?.shabadId && !payload?.baniType) {
    return;
  }

  if (payload.baniType === 'bani') {
    navigatorActions.setIsSundarGutkaBani(true);
    navigatorActions.setSundarGutkaBaniId(payload.shabadId);
    navigatorActions.setIsCeremonyBani(false);
  } else if (payload.baniType === 'ceremony') {
    navigatorActions.setIsSundarGutkaBani(false);
    navigatorActions.setIsCeremonyBani(true);
    navigatorActions.setCeremonyId(payload.shabadId);
  } else if (payload.shabadId) {
    navigatorActions.setIsSundarGutkaBani(false);
    navigatorActions.setIsCeremonyBani(false);
    navigatorActions.setActiveShabadId(payload.shabadId);
  }
});

export default ViewerState;

