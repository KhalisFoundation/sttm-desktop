import { action } from 'easy-peasy';
import { convertToCamelCase } from '../../utils';

// can we change them to import?
const fs = require('fs');

const createOverlaySettingsState = (settingsSchema, savedSettings, userConfigPath) => {
  const userSettingsState = {};
  Object.keys(settingsSchema).forEach(settingKey => {
    const stateVarName = convertToCamelCase(settingKey);
    const stateFuncName = `set${convertToCamelCase(settingKey, true)}`;

    userSettingsState[stateVarName] =
      savedSettings[`bani-overlay-${settingKey}`] || settingsSchema[settingKey].initialValue;

    userSettingsState[stateFuncName] = action((state, payload) => {
      // eslint-disable-next-line no-param-reassign
      state[stateVarName] = payload;

      // Save settings to file
      const updatedSettings = savedSettings;
      updatedSettings[`bani-overlay-${settingKey}`] = payload;
      fs.writeFileSync(userConfigPath, JSON.stringify(updatedSettings));

      // global.getOverlaySettings[stateVarName] = payload;
      // ipcRenderer.send('save-overlay-settings', global.getOverlaySettings);
      return state;
    });
  });
  return userSettingsState;
};

export default createOverlaySettingsState;
