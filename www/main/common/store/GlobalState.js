/* eslint-disable no-param-reassign */
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
    verseSelected: null,
    shabadSelected: null,
    versesHistory: [],
    traversedVerses: [],
    searchedShabads: [],
    searchSource: 'all',
    searchRaag: 'ALL',
    searchWriter: 'ALL',
    currentSelectedVerse: '',
    setSearchQuery: action((state, newSearchQuery) => {
      state.searchQuery = newSearchQuery;
    }),
    setSelectedLanguage: action((state, language) => {
      state.selectedLanguage = language;
    }),
    setSearchOption: action((state, newSearchOption) => {
      state.searchOption = newSearchOption;
    }),
    setVerseSelected: action((state, newVerse) => {
      state.verseSelected = newVerse;
    }),
    setShabadSelected: action((state, newShabad) => {
      state.shabadSelected = newShabad;
    }),
    setVersesHistory: action((state, newHistory) => {
      state.versesHistory = newHistory;
    }),
    setTraversedVerses: action((state, newVerses) => {
      state.traversedVerses = newVerses;
    }),
    setSearchedShabads: action((state, searchResult) => {
      state.searchedShabads = searchResult;
    }),
    setSearchSource: action((state, newSource) => {
      state.searchSource = newSource;
    }),
    setSearchRaag: action((state, newRaag) => {
      state.searchRaag = newRaag;
    }),
    setSearchWriter: action((state, newWriter) => {
      state.searchWriter = newWriter;
    }),
    setCurrentSelectedVerse: action((state, currentVerse) => {
      state.currentSelectedVerse = currentVerse;
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
