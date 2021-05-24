import { action } from 'easy-peasy';
import { convertToCamelCase } from '../../utils';

const createNavigatorSettingsState = settingsSchema => {
  const navigatorSettingsState = {};
  Object.keys(settingsSchema).forEach(settingKey => {
    const stateVarName = convertToCamelCase(settingKey);
    const stateFuncName = `set${convertToCamelCase(settingKey, true)}`;

    navigatorSettingsState[stateVarName] = settingsSchema[settingKey];

    navigatorSettingsState[stateFuncName] = action((state, payload) => {
      const oldValue = state[stateVarName];
      // eslint-disable-next-line no-param-reassign
      state[stateVarName] = payload;
      if (global.webview) {
        global.webview.send('update-viewer-setting', {
          stateName: stateVarName,
          payload,
          oldValue,
          actionName: stateFuncName,
          settingType: 'navigator',
        });
      }

      if (global.platform) {
        global.platform.ipc.send('update-viewer-setting', {
          stateName: stateVarName,
          payload,
          oldValue,
          actionName: stateFuncName,
          settingType: 'navigator',
        });
      }

      return state;
    });
  });
  return navigatorSettingsState;
};

export default createNavigatorSettingsState;
