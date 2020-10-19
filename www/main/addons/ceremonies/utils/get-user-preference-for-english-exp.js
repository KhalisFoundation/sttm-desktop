import { remote } from 'electron';

const { store } = remote.require('./app');

const getUserPreferenceFor = (prefFor, token) => {
  const forVal = store.getUserPref(`gurbani.ceremonies.ceremony-${token}-${prefFor}`);
  if (forVal === undefined) {
    return true;
  }
  return forVal;
};

export default getUserPreferenceFor;
