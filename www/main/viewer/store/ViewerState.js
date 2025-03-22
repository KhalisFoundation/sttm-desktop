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
  // Create shadow object of user settings from Global State
  userSettings: {
    ...GlobalState.getState().userSettings,
    ...createSettingsActions('userSettings'),
  },
  navigator: {
    ...GlobalState.getState().navigator,
    ...createSettingsActions('navigator'),
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
    slideOrder: ['translation', 'teeka', 'transliteration'],
    setSlideOrder: action((state, slideOrder) => ({
      ...state,
      slideOrder,
    })),
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
});

// Whenever a setting is changed in GlobalState, call the respective action here as well.
global.platform.ipc.on('update-viewer-setting', (_event, setting) => {
  const { actionName, payload, settingType } = JSON.parse(setting);
  ViewerState.getActions()[settingType][actionName](payload);
});

export default ViewerState;
