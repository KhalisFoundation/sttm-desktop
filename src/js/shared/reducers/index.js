import { combineReducers } from 'redux';
import userPrefs from './userPrefs';
import search from './search';
import changelog from './changelog';
import obs from './obs';
import gurmukhiKB from './keyboard';
import rendererState from './rendererState';

export default () => {
  const reducers = {
    changelog,
    gurmukhiKB,
    obs,
    rendererState,
    search,
    userPrefs,
  };

  return combineReducers({ ...reducers });
};
