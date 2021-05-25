/* eslint-disable no-param-reassign */
import { createStore, action } from 'easy-peasy';
import { DEFAULT_OVERLAY } from '../constants';
import createUserSettingsState from './user-settings/create-user-settings-state';
import createNavigatorSettingsState from './navigator-settings/create-navigator-settings';
import { savedSettings, userConfigPath } from './user-settings/get-saved-user-settings';

const { settings } = require('../../../configs/user-settings.json');
const navigatorSettings = require('../../../configs/navigator-settings.json');

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
  navigator: createNavigatorSettingsState(navigatorSettings),
  viewerSettings: {
    quickTools: false,
  },
  userSettings: createUserSettingsState(settings, savedSettings, userConfigPath),
});

global.platform.ipc.on('update-global-setting', (event, setting) => {
  const { settingType, actionName, payload } = setting;
  GlobalState.getActions()[settingType][actionName](payload);
});

export default GlobalState;
