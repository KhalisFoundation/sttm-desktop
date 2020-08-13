import { remote } from 'electron';

const { store } = remote.require('./app');

const getUserPreferenceForEnglishExp = token => {
  const englishExpVal = store.getUserPref(`gurbani.ceremonies.ceremony-${token}-english`);
  if (englishExpVal === undefined) {
    return true;
  }
  return englishExpVal;
};

export default getUserPreferenceForEnglishExp;
