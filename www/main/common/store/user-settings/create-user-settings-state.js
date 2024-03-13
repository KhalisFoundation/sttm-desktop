import { action } from 'easy-peasy';
import { convertToCamelCase } from '../../utils';

// can we change them to import?
const fs = require('fs');

const createUserSettingsState = (settingsSchema, savedSettings, userConfigPath) => {
  const userSettingsState = {};
  Object.keys(settingsSchema).forEach((settingKey) => {
    const stateVarName = convertToCamelCase(settingKey);
    const stateFuncName = `set${convertToCamelCase(settingKey, true)}`;

    if (typeof savedSettings[settingKey] === 'undefined') {
      userSettingsState[stateVarName] = settingsSchema[settingKey].initialValue;
    } else {
      userSettingsState[stateVarName] = savedSettings[settingKey];
    }

    // Defines an action to reset all font size settings to their initial values.
    userSettingsState.resetFontSizes = action((state) => {
      Object.keys(settingsSchema).forEach((settingKey) => {
        if (settingsSchema[settingKey].type === 'range' && settingKey.includes('font-size')) {
          const stateVarName = convertToCamelCase(settingKey);
          const stateFuncName = `set${convertToCamelCase(settingKey, true)}`;
          const oldValue = state[stateVarName]; // Capture the old value before updating
          const initialValue = settingsSchema[settingKey].initialValue;
          console.log('OldSavedsettings:', oldValue)
          // Update state and savedSettings
          state[stateVarName] = initialValue;
          savedSettings[settingKey] = initialValue;

          // Prepare payload
          const payload = {
            stateName: stateVarName,
            payload: initialValue,
            oldValue,
            actionName: stateFuncName,
            settingType: 'userSettings',
          };
          console.log('Payload:', payload)
          // Broadcast the update to the webview if available
          if (global.webview) {
            global.webview.send('update-viewer-setting', JSON.stringify(payload));
          }

          // Broadcast the update to the platform IPC if available
          if (global.platform) {
            global.platform.ipc.send('update-viewer-setting', JSON.stringify(payload));
          }
        }
      });

      //Save the updated settings to a file
      fs.writeFileSync(userConfigPath, JSON.stringify(savedSettings));
      console.log('Savedsettings:', savedSettings)
    });

    userSettingsState[stateFuncName] = action((state, payload) => {
      const oldValue = state[stateVarName];
      // eslint-disable-next-line no-param-reassign
      state[stateVarName] = payload;
      if (global.webview) {
        global.webview.send(
          'update-viewer-setting',
          JSON.stringify({
            stateName: stateVarName,
            payload,
            oldValue,
            actionName: stateFuncName,
            settingType: 'userSettings',
          }),
        );
      }

      if (global.platform) {
        global.platform.ipc.send(
          'update-viewer-setting',
          JSON.stringify({
            stateName: stateVarName,
            payload,
            oldValue,
            actionName: stateFuncName,
            settingType: 'userSettings',
          }),
        );
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
