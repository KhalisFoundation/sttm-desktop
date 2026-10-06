import { action } from 'easy-peasy';
import { convertToCamelCase } from '../../utils';

// Actions run inside an immer draft. JSON.stringify on a draft (or a nested
// proxy such as pane.versesRead) finalizes it, and the next action then throws
// "Cannot perform 'get' on a proxy that has been revoked".
const toPlain = (value) => {
  if (value == null || typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (err) {
    return value;
  }
};

const createNavigatorSettingsState = (settingsSchema) => {
  const navigatorSettingsState = {};
  Object.keys(settingsSchema).forEach((settingKey) => {
    const stateVarName = convertToCamelCase(settingKey);
    const stateFuncName = `set${convertToCamelCase(settingKey, true)}`;

    navigatorSettingsState[stateVarName] = settingsSchema[settingKey];

    navigatorSettingsState[stateFuncName] = action((state, payload) => {
      const oldValue = toPlain(state[stateVarName]);
      const plainPayload = toPlain(payload);
      // Pane updates are often `{ ...livePane, verse }`. The spread can carry a
      // revoked immer proxy, and replacing the pane also drops fields the caller
      // forgot. Merge a plain clone into the draft instead.
      if (/^pane\d+$/.test(stateVarName) && plainPayload && typeof plainPayload === 'object') {
        const current = toPlain(state[stateVarName]) || {};
        const next = { ...current, ...plainPayload };
        Object.keys(next).forEach((key) => {
          if (Array.isArray(next[key])) next[key] = next[key].slice();
        });
        // eslint-disable-next-line no-param-reassign
        state[stateVarName] = next;
      } else {
        // eslint-disable-next-line no-param-reassign
        state[stateVarName] = plainPayload;
      }

      if (global.webview) {
        global.webview.send(
          'update-viewer-setting',
          JSON.stringify({
            stateName: stateVarName,
            payload: plainPayload,
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
            payload: plainPayload,
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
