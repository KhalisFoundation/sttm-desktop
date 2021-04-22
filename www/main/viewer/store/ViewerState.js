import { createStore, action } from 'easy-peasy';
import { ipcRenderer } from 'electron';
import GlobalState from '../../common/store/GlobalState';
global.platform = require('../../desktop_scripts');

const createUserSettingsActions = () => {
  console.log('creating user settings');
  const userSettingsActions = {};
  Object.keys(GlobalState.getState().userSettings).forEach(stateVarName => {
    // convert state name ex- larivaar to action name ex- setLarivaar
    const stateActionName = `set${stateVarName.charAt(0).toUpperCase()}${stateVarName.slice(1)}`;
    userSettingsActions[stateActionName] = action((state, payload) => {
      state[stateVarName] = payload;
    });
  });

  return userSettingsActions;
};

const ViewerState = createStore({
  // Create shadow object of user settings from Global State
  userSettings: {
    ...GlobalState.getState().userSettings,
    ...createUserSettingsActions(),
  },
});

// Whenever a setting is chagned in GlobalState, call the respective action here as well.
global.platform.ipc.on('setting-changed', (event, setting) => {
  console.log('this was called');
  const { state, action, payload } = setting;
  ViewerState.getActions().userSettings[action](payload);
  console.log(ViewerState.getState().userSettings[state], state);
});

export default ViewerState;
