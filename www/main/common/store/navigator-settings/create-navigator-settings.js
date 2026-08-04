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
      // Mutate the Immer draft in place and return nothing. Returning the draft
      // makes easy-peasy re-assign it onto the *previous* committed state before
      // finalising (see simpleProduce), which then revokes that proxy. Any later
      // read of the old state then throws "proxy that has been revoked" and
      // white-screens the app (hit when a userSettings change is followed by a
      // navigator change, e.g. toggling Akhand Paatth then selecting a line).
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
    });
  });
  return navigatorSettingsState;
};

export default createNavigatorSettingsState;
