import { action } from 'easy-peasy';
import { convertToCamelCase } from '../utils';

// can we change them to import?
const electron = require('electron');
const fs = require('fs');
const path = require('path');
const { settings } = require('../../../main/common/constants/user-settings.json');

const userDataPath = (electron.app || electron.remote.app).getPath('userData');
const userConfigPath = path.join(userDataPath, 'user-data.json');
const savedSettings = parseDataFile(userConfigPath) || {};

function parseDataFile(filePath) {
  // We'll try/catch it in case the file doesn't exist yet,
  // which will be the case on the first application run.
  // `fs.readFileSync` will return a JSON string which we then parse into a Javascript object
  try {
    return JSON.parse(fs.readFileSync(filePath));
  } catch (error) {
    // if there was some kind of error, return the passed in defaults instead.
    return null;
  }
}

if (typeof localStorage === 'object') {
  localStorage.setItem('prefs', JSON.stringify(savedSettings));
}

Object.keys(savedSettings).forEach(key => {
  document.body.classList.add(`${key}-${savedSettings[key]}`);
});

const userSettingsState = {};
Object.keys(settings).forEach(settingKey => {
  const stateVarName = convertToCamelCase(settingKey);
  const stateFuncName = `set${convertToCamelCase(settingKey, true)}`;

  userSettingsState[stateVarName] = savedSettings[settingKey] || settings[settingKey].initialValue;

  userSettingsState[stateFuncName] = action((state, payload) => {
    // Update the DOM
    const oldValue = state[stateVarName];
    document.body.classList.remove(`${settingKey}-${oldValue}`);
    // eslint-disable-next-line no-param-reassign
    state[stateVarName] = payload;
    document.body.classList.add(`${settingKey}-${payload}`);
    global.webview.send('save-settings', { key: settingKey, payload, oldValue });

    // Save settings to file
    savedSettings[settingKey] = payload;
    fs.writeFileSync(userConfigPath, JSON.stringify(savedSettings));

    // Update localStorage for viewer
    if (typeof localStorage === 'object') {
      localStorage.setItem('prefs', JSON.stringify(savedSettings));
    }

    // Run the sideeffects
    if (typeof global.controller[settingKey] === 'function') {
      global.controller[settingKey](payload);
    }

    return state;
  });
});

export default userSettingsState;
