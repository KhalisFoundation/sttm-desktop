import { action } from 'easy-peasy';
import { convertToCamelCase } from '../utils';
import { savedSettings, userConfigPath } from './SavedUserSettings';

// can we change them to import?
const electron = require('electron');
const fs = require('fs');
const path = require('path');
const { settings } = require('../../../main/common/constants/user-settings.json');

if (typeof localStorage === 'object') {
  localStorage.setItem('prefs', JSON.stringify(savedSettings));
}
if (document) {
  Object.keys(savedSettings).forEach(key => {
    document.body.classList.add(`${key}-${savedSettings[key]}`);
  });
}

const userSettingsState = {};
Object.keys(settings).forEach(settingKey => {
  const stateVarName = convertToCamelCase(settingKey);
  const stateFuncName = `set${convertToCamelCase(settingKey, true)}`;

  userSettingsState[stateVarName] = savedSettings[settingKey] || settings[settingKey].initialValue;

  userSettingsState[stateFuncName] = action((state, payload) => {
    const oldValue = state[stateVarName];
    // eslint-disable-next-line no-param-reassign
    state[stateVarName] = payload;
    console.log(settingKey, payload, oldValue);
    global.webview.send('save-settings', { key: settingKey, payload, oldValue });

    // Save settings to file
    savedSettings[settingKey] = payload;
    fs.writeFileSync(userConfigPath, JSON.stringify(savedSettings));

    // Update localStorage for viewer
    if (typeof localStorage === 'object') {
      localStorage.setItem('prefs', JSON.stringify(savedSettings));
    }

    // Update DOM if ready
    if (document) {
      document.body.classList.remove(`${settingKey}-${oldValue}`);
      document.body.classList.add(`${settingKey}-${payload}`);
    }

    // Run the sideeffects
    if (typeof global.controller[settingKey] === 'function') {
      global.controller[settingKey](payload);
    }

    return state;
  });
});

export default userSettingsState;
