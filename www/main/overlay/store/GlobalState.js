import { createStore, action } from 'easy-peasy';

import convertToCamelCase from '../../common/utils/convert-to-camel-case';

const { sidebar, bottomBar } = require('../../../configs/overlay.json');

const GlobalState = createStore({
  baniOverlay: (() => {
    const stateObj = {};
    const settings = { ...sidebar.settings, ...bottomBar.settings };
    Object.keys(settings).forEach(settingKey => {
      const stateVarName = convertToCamelCase(settingKey);
      const stateFuncName = `set${convertToCamelCase(settingKey, true)}`;
      stateObj[stateVarName] = settings[settingKey].initialValue;
      stateObj[stateFuncName] = action((state, payload) => {
        const updatedState = { ...state };
        updatedState[stateVarName] = payload;
        return updatedState;
      });
    });
    stateObj.theme = 'a-new-day';
    stateObj.setTheme = action((state, theme) => {
      return {
        ...state,
        theme,
      };
    });
    return stateObj;
  })(),
});

export default GlobalState;
