import { action } from 'easy-peasy';
import { convertToCamelCase } from '../../utils';
import { getControllerFontSizes } from '../../../addons/bani-controller/utils/controller-font-sizes';

// can we change them to import?
const fs = require('fs');

// JSON.stringify on an immer draft revokes the proxy and crashes the next dispatch.
const toPlain = (value) => {
  if (value == null || typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (err) {
    return value;
  }
};

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

    userSettingsState[stateFuncName] = action((state, payload) => {
      const oldValue = toPlain(state[stateVarName]);
      const plainPayload = toPlain(payload);
      // eslint-disable-next-line no-param-reassign
      state[stateVarName] = plainPayload;
      if (global.webview) {
        global.webview.send(
          'update-viewer-setting',
          JSON.stringify({
            stateName: stateVarName,
            payload: plainPayload,
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
            payload: plainPayload,
            oldValue,
            actionName: stateFuncName,
            settingType: 'userSettings',
          }),
        );
      }

      // Save settings to file
      const updatedSettings = savedSettings;
      updatedSettings[settingKey] = plainPayload;
      fs.writeFileSync(userConfigPath, JSON.stringify(updatedSettings));

      // Update localStorage
      if (typeof localStorage === 'object') {
        localStorage.setItem('userSettings', JSON.stringify(updatedSettings));
      }

      // Update global object
      global.getUserSettings[stateVarName] = plainPayload;

      // Update DOM if ready
      if (document && !settingsSchema[settingKey].dontApplyClass) {
        document.body.classList.remove(`${settingKey}-${oldValue}`);
        document.body.classList.add(`${settingKey}-${plainPayload}`);
      }

      // Run the sideeffects
      if (typeof global.controller[settingKey] === 'function') {
        global.controller[settingKey](plainPayload);
      }

      const fontSizes = getControllerFontSizes(global.getUserSettings);

      if (window.socket !== undefined && window.socket !== null) {
        window.socket.emit('data', {
          host: 'sttm-desktop',
          type: 'settings',
          settings: {
            fontSizes,
          },
        });
      }
      // Do not return the immer draft (easy-peasy/immer revokes it on finalize).
    });
  });
  return userSettingsState;
};

export default createUserSettingsState;
