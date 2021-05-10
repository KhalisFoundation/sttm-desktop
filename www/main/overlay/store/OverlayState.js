import { createStore, action } from 'easy-peasy';
import GlobalState from '../../common/store/GlobalState';
import convertToCamelCase from '../../common/utils/convert-to-camel-case';

global.platform = require('../../desktop_scripts');

const createOverlayActions = () => {
  const overlayActions = {};
  Object.keys(GlobalState.getState().baniOverlay).forEach(stateVarName => {
    const stateActionName = `set${convertToCamelCase(stateVarName, true)}`;
    overlayActions[stateActionName] = action((state, payload) => {
      // eslint-disable-next-line no-param-reassign
      state[stateVarName] = payload;

      global.platform.ipc.send('recieve-setting', {
        actionName: stateActionName,
        payload,
        settingType: 'baniOverlay',
      });

      return state;
    });
  });
  return overlayActions;
};

const OverlayState = createStore({
  baniOverlay: {
    ...GlobalState.getState().baniOverlay,
    ...createOverlayActions(),
  },
});

export default OverlayState;
