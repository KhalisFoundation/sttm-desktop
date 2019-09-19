import { combineReducers } from 'redux';
import changelog from './changelog';
import gurmukhiKB from './keyboard';
import obs from './obs';
import rendererState from './rendererState';
import search from './search';
import searchOptions from './searchOptions';
import userPrefs from './userPrefs';

export default () => {
  const reducers = {
    changelog,
    gurmukhiKB,
    obs,
    rendererState,
    search,
    searchOptions,
    userPrefs,
  };

  return combineReducers({ ...reducers });
};
