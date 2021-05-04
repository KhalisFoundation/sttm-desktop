import { createStore, action } from 'easy-peasy';

import { DEFAULT_OVERLAY } from '../constants';
import { savedSettings, userConfigPath } from './user-settings/get-saved-user-settings';

import createUserSettingsState from './user-settings/create-user-settings-state';
import createOverlaySettingsState from './user-settings/create-overlay-settings-state';

const { sidebar, bottomBar } = require('../../../configs/overlay.json');
const { settings } = require('../../../configs/user-settings.json');

global.platform = require('../../desktop_scripts');

const GlobalState = createStore({
  app: {
    overlayScreen: DEFAULT_OVERLAY,
    isListeners: false,
    setOverlayScreen: action((state, payload) => {
      return {
        ...state,
        overlayScreen: payload,
      };
    }),
    setListeners: action((state, listenersState) => {
      return {
        ...state,
        isListeners: listenersState,
      };
    }),
  },
  baniController: {
    adminPin: null,
    code: null,
    isConnected: false,
    setAdminPin: action((state, adminPin) => {
      return {
        ...state,
        adminPin,
      };
    }),
    setCode: action((state, code) => {
      return {
        ...state,
        code,
      };
    }),
    setConnection: action((state, connectionState) => {
      return {
        ...state,
        isConnected: connectionState,
      };
    }),
  },
  userSettings: createUserSettingsState(settings, savedSettings, userConfigPath),
  baniOverlay: createOverlaySettingsState(
    { ...sidebar.settings, ...bottomBar.settings },
    savedSettings,
    userConfigPath,
  ),
});

global.platform.ipc.on('recieve-setting', (event, setting) => {
  console.log('Event received in globalstate.js');
  const { settingType, actionName, payload } = setting;
  GlobalState.getActions()[settingType][actionName](payload);
});

export default GlobalState;
