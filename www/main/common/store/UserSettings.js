import { action } from 'easy-peasy';
import { convertToCamelCase } from '../utils';

const { settings } = require('../../../main/common/constants/user-settings.json');

const userSettingsState = {};
Object.keys(settings).forEach(settingKey => {
  userSettingsState[convertToCamelCase(settingKey)] = settings[settingKey].initialValue;
  userSettingsState[`set${convertToCamelCase(settingKey, true)}`] = action((state, payload) => {
    // eslint-disable-next-line no-param-reassign
    state[convertToCamelCase(settingKey)] = payload;
    return state;
  });
});
console.log(userSettingsState);

export default userSettingsState;
