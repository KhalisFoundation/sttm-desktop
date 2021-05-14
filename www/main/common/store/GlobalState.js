import { createStore, action } from 'easy-peasy';
import { DEFAULT_OVERLAY } from '../constants';
import createUserSettingsState from './user-settings/create-user-settings-state';
import { savedSettings, userConfigPath } from './user-settings/get-saved-user-settings';

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
  navigator: {
    selectedLanguage: 'gr',
    searchOption: 0,
    searchQuery: '',
    verseSelected: null,
    shabadSelected: null,
    versesHistory: null,
    testingState: '',
    searchedShabads: [],
    searchSource: 'all',
    setSearchQuery: action((state, newSearchQuery) => {
      return {
        ...state,
        searchQuery: newSearchQuery,
      };
    }),
    setTestingState: action((state, language) => {
      return {
        ...state,
        testingState: language,
      };
    }),
    setSelectedLanguage: action((state, language) => {
      return {
        ...state,
        selectedLanguage: language,
      };
    }),
    setSearchOption: action((state, newSearchOption) => {
      return {
        ...state,
        searchOption: newSearchOption,
      };
    }),
    setVerseSelected: action((state, newVerse) => {
      return {
        ...state,
        verseSelected: newVerse,
      };
    }),
    setShabadSelected: action((state, newShabad) => {
      return {
        ...state,
        shabadSelected: newShabad,
      };
    }),
    setVersesHistory: action((state, newHistory) => {
      return {
        ...state,
        versesHistory: newHistory,
      };
    }),
    setSearchedShabads: action((state, searchResult) => {
      return {
        ...state,
        searchedShabads: searchResult,
      };
    }),
    setSearchSource: action((state, newSource) => {
      return {
        ...state,
        searchSource: newSource,
      };
    }),
  },
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
