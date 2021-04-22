import { action } from 'easy-peasy';
import { convertToCamelCase } from '../../utils';

const { ipcRenderer } = require('electron');

// can we change them to import?
const fs = require('fs');
const themeObjects = require('../../../../configs/overlay_presets.json');

const createOverlaySettingsState = (settingsSchema, savedSettings, userConfigPath) => {
  const userSettingsState = {};
  Object.keys(settingsSchema).forEach(settingKey => {
    const stateVarName = convertToCamelCase(settingKey);
    const stateFuncName = `set${convertToCamelCase(settingKey, true)}`;

    userSettingsState[stateVarName] =
      savedSettings[settingKey] || settingsSchema[settingKey].initialValue;

    userSettingsState[stateFuncName] = action((state, payload) => {
      const oldValue = state[stateVarName];

      if (oldValue !== payload) {
        /* eslint-disable no-param-reassign */
        state[stateVarName] = payload;
        if (stateFuncName === 'setOverlayTheme') {
          const { gurbaniTextColor, textColor, bgColor } = themeObjects[payload];
          state.gurbaniTextColor = gurbaniTextColor;
          state.textColor = textColor;
          state.bgColor = bgColor;
        }
        /* eslint-enable */

        // Save settings to file
        const updatedSettings = savedSettings;
        updatedSettings[settingKey] = payload;
        fs.writeFileSync(userConfigPath, JSON.stringify(updatedSettings));

        // Update localStorage
        if (typeof localStorage === 'object') {
          localStorage.setItem('overlaySettings', JSON.stringify(updatedSettings));
        }

        global.getOverlaySettings = state;
        ipcRenderer.send('save-overlay-settings', global.getOverlaySettings);
      }
      return state;
    });
  });
  return userSettingsState;
};

export default createOverlaySettingsState;
