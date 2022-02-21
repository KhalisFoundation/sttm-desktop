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
      if (global.webview) {
        global.webview.send('update-viewer-setting', {
          stateName: stateVarName,
          payload,
          oldValue,
          actionName: stateFuncName,
          settingType: 'userSettings',
        });
      }

      if (global.platform) {
        global.platform.ipc.send('update-viewer-setting', {
          stateName: stateVarName,
          payload,
          oldValue,
          actionName: stateFuncName,
          settingType: 'userSettings',
        });
      }

      // Save settings to file
      const updatedSettings = savedSettings;
      updatedSettings[settingKey] = payload;
      fs.writeFileSync(userConfigPath, JSON.stringify(updatedSettings));

      // Update localStorage
      if (typeof localStorage === 'object') {
        localStorage.setItem('userSettings', JSON.stringify(updatedSettings));
      }

      // Update global object
      global.getUserSettings[stateVarName] = payload;

      // Update DOM if ready
      if (document && !settingsSchema[settingKey].dontApplyClass) {
        document.body.classList.remove(`${settingKey}-${oldValue}`);
        document.body.classList.add(`${settingKey}-${payload}`);
      }

      // Run the sideeffects
      if (typeof global.controller[settingKey] === 'function') {
        global.controller[settingKey](payload);
      }

      const fontSizes = {
        gurbani: parseInt(savedSettings['gurbani-font-size'], 10),
        translation: parseInt(savedSettings['translation-font-size'], 10),
        teeka: parseInt(savedSettings['teeka-font-size'], 10),
        transliteration: parseInt(savedSettings['transliteration-font-size'], 10),
      };

      if (window.socket !== undefined && window.socket !== null) {
        window.socket.emit('data', {
          host: 'sttm-desktop',
          type: 'settings',
          settings: {
            fontSizes,
          },
        });
      }

      return state;
    });
  });
  return userSettingsState;
};

export default createUserSettingsState;
