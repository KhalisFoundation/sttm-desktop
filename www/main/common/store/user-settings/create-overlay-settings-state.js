import { action } from 'easy-peasy';
import { convertToCamelCase } from '../../utils';

// can we change them to import?
const fs = require('fs');
const { ipcRenderer } = require('electron');

const createOverlaySettingsState = (settingsSchema, savedSettings, userConfigPath) => {
  const userSettingsState = {};
  Object.keys(settingsSchema).forEach(settingKey => {
    const stateVarName = convertToCamelCase(settingKey);
    const stateFuncName = `set${convertToCamelCase(settingKey, true)}`;

    userSettingsState[stateVarName] =
      savedSettings.baniOverlay[settingKey] || settingsSchema[settingKey].initialValue;

    userSettingsState[stateFuncName] = action((state, payload) => {
      // eslint-disable-next-line no-param-reassign
      state[stateVarName] = payload;

      // Save settings to file
      const updatedSettings = savedSettings;
      updatedSettings.baniOverlay[settingKey] = payload;
      fs.writeFileSync(userConfigPath, JSON.stringify(updatedSettings));

      ipcRenderer.send('save-overlay-settings', state);

      return state;
    });
  });
  return userSettingsState;
};

export default createOverlaySettingsState;
