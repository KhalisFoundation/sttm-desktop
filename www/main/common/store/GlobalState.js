import { createStore, action } from 'easy-peasy';
import { remote } from 'electron';
import { DEFAULT_OVERLAY } from '../constants';
import createUserSettingsState from './user-settings/create-user-settings-state';
import { savedSettings, userConfigPath } from './user-settings/get-saved-user-settings';
import { GURMUKHI_SEARCH_TEXTS } from '../constants/banidb';

const { settings } = require('../../../configs/user-settings.json');

const { i18n } = remote.require('./app');

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
    searchOption: i18n.t(`SEARCH.${GURMUKHI_SEARCH_TEXTS[0]}`),
    verseSelected: null,
    shabadSelected: null,
    versesHistory: [],
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
  },
  userSettings: createUserSettingsState(settings, savedSettings, userConfigPath),
});

export default GlobalState;
