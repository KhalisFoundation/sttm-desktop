import { action } from 'easy-peasy';
import { convertToCamelCase } from '../../utils';

// can we change them to import?
const fs = require('fs');

const createUserSettingsState = (settingsSchema, savedSettings, userConfigPath) => {
  const userSettingsState = {};
  Object.keys(settingsSchema).forEach(settingKey => {
    const stateVarName = convertToCamelCase(settingKey);
    const stateFuncName = `set${convertToCamelCase(settingKey, true)}`;

    userSettingsState[stateVarName] =
      savedSettings[settingKey] || settingsSchema[settingKey].initialValue;

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
  return userSettingsState;
};

export default createUserSettingsState;
