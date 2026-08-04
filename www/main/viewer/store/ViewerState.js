import { createStore, action } from 'easy-peasy';
import GlobalState from '../../common/store/GlobalState';
import { DEFAULT_LINE_SPACING, DEFAULT_VERSE_SPACING } from '../../common/constants';

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
    // Mirror `GlobalState.viewerSettings`; see the note there.
    verseSpacing: DEFAULT_VERSE_SPACING,
    lineSpacing: DEFAULT_LINE_SPACING,
    quickToolsOpen: false,
    paddingToolsOpen: false,
    setQuickToolsOpen: action((state, payload) => {
      const newState = state;
      newState.paddingToolsOpen = false; // explictely making sure we are closing the paddingTools when setting the quick tools.
      newState.quickToolsOpen = payload;
    }),
    setPaddingToolsOpen: action((state, payload) => {
      const newState = state;
      newState.quickToolsOpen = false; // explictely making sure we are closing the quickTools when setting the padding tools.
      newState.paddingToolsOpen = payload;
    }),
    setPadding: action((state, payload) => {
      const newState = state;
      newState.containerPadding[payload.type] = payload.value;
    }),
    setVerseSpacing: action((state, payload) => {
      const newState = state;
      newState.verseSpacing = payload;
    }),
    setLineSpacing: action((state, payload) => {
      const newState = state;
      newState.lineSpacing = payload;
    }),
  },
});

// Whenever a setting is changed in GlobalState, call the respective action here as well.
global.platform.ipc.on('update-viewer-setting', (_event, setting) => {
  const { actionName, payload, settingType } = JSON.parse(setting);
  ViewerState.getActions()[settingType][actionName](payload);
});

export default ViewerState;
