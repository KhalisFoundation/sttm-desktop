import { action } from 'easy-peasy';
import { convertToCamelCase } from '../../utils';

const createNavigatorSettingsState = (settingsSchema) => {
  const navigatorSettingsState = {};
  Object.keys(settingsSchema).forEach((settingKey) => {
    const stateVarName = convertToCamelCase(settingKey);
    const stateFuncName = `set${convertToCamelCase(settingKey, true)}`;

    navigatorSettingsState[stateVarName] = settingsSchema[settingKey];

    navigatorSettingsState[stateFuncName] = action((state, payload) => {
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
            settingType: 'navigator',
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
            settingType: 'navigator',
          }),
        );
      }

      // NOTE: do NOT `return state` here. easy-peasy actions run inside immer;
      // returning the draft makes immer treat it as the replacement state, then
      // revokes it once the action finalizes. Any later read of the navigator
      // slice then throws "Cannot perform 'get' on a proxy that has been
      // revoked" (crashed VoiceFollow while highlighting). Mutating the draft is
      // sufficient — immer applies the change with no return value.
    });
  });
  return navigatorSettingsState;
};

export default createNavigatorSettingsState;
