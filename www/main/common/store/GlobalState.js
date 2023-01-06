/* eslint-disable no-param-reassign */
import { createStore, action } from 'easy-peasy';

import { DEFAULT_OVERLAY } from '../constants';

import createUserSettingsState from './user-settings/create-user-settings-state';
import createNavigatorSettingsState from './navigator-settings/create-navigator-settings';

import { savedSettings, userConfigPath } from './user-settings/get-saved-user-settings';
import { savedOverlaySettings } from './user-settings/get-saved-overlay-settings';

import createOverlaySettingsState from './user-settings/create-overlay-settings-state';

const { sidebar, bottomBar } = require('../../../configs/overlay.json');
const { settings } = require('../../../configs/user-settings.json');
const navigatorSettings = require('../../../configs/navigator-settings.json');

global.platform = require('../../desktop_scripts');

global.platform = require('../../desktop_scripts');

const GlobalState = createStore({
  app: {
    overlayScreen: DEFAULT_OVERLAY,
    isListeners: false,
    setOverlayScreen: action((state, payload) => ({
      ...state,
      overlayScreen: payload,
    })),
    setListeners: action((state, listenersState) => ({
      ...state,
      isListeners: listenersState,
    })),
  },
  baniController: {
    adminPin: null,
    code: null,
    isConnected: false,
    setAdminPin: action((state, adminPin) => ({
      ...state,
      adminPin,
    })),
    setCode: action((state, code) => ({
      ...state,
      code,
    })),
    setConnection: action((state, connectionState) => ({
      ...state,
      isConnected: connectionState,
    })),
  },
  navigator: createNavigatorSettingsState(navigatorSettings),
  viewerSettings: {
    quickTools: false,
    slideOrder: ['translation', 'teeka', 'transliteration'],
    setSlideOrder: action((state, payload) => {
      const oldValue = state.slideOrder;
      if (global.webview) {
        global.webview.send(
          'update-viewer-setting',
          JSON.stringify({
            stateName: 'slideOrder',
            payload,
            oldValue,
            actionName: 'setSlideOrder',
            settingType: 'viewerSettings',
          }),
        );
      }

      if (global.platform) {
        global.platform.ipc.send(
          'update-viewer-setting',
          JSON.stringify({
            stateName: 'slideOrder',
            payload,
            oldValue,
            actionName: 'setSlideOrder',
            settingType: 'viewerSettings',
          }),
        );
      }
      state.slideOrder = payload;
      return state;
    }),
  },
  userSettings: createUserSettingsState(settings, savedSettings, userConfigPath),
  baniOverlay: createOverlaySettingsState(
    { ...sidebar.settings, ...bottomBar.settings },
    savedOverlaySettings,
    userConfigPath,
  ),
});

global.platform.ipc.on('update-global-setting', (event, setting) => {
  const { settingType, actionName, payload } = JSON.parse(setting);
  GlobalState.getActions()[settingType][actionName](payload);
});

global.platform.ipc.on('get-overlay-prefs', () => {
  const overlayState = GlobalState.getState().baniOverlay;
  global.platform.ipc.send('save-overlay-settings', JSON.stringify(overlayState));
});

export default GlobalState;
