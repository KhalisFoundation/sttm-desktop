import { createStore, action } from 'easy-peasy';
import GlobalState from '../../common/store/GlobalState';

global.platform = require('../../desktop_scripts');

/* TODO: remove the settingsType argument */
const createSettingsActions = settingsType => {
  const userSettingsActions = {};
  Object.keys(GlobalState.getState()[settingsType]).forEach(stateVarName => {
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
    quickToolsOpen: false,
    setQuickToolsOpen: action((state, payload) => {
      return {
        ...state,
        quickToolsOpen: payload,
      };
    }),
  },
});

// Whenever a setting is chagned in GlobalState, call the respective action here as well.
global.platform.ipc.on('update-viewer-setting', (event, setting) => {
  const { actionName, payload, settingType } = setting;
  ViewerState.getActions()[settingType][actionName](payload);
});

export default ViewerState;
