import LocalStore from 'electron-store';
import throttle from 'lodash.throttle';
import configureStore from '../shared/configureStore';

const localStore = new LocalStore();
const initialState = localStore.get('prefs');

const store = configureStore(initialState);

// Regularly save the app state to the local store file
store.subscribe(
  throttle(() => {
    const state = store.getState();
    delete state.search;
    delete state.rendererState;
    /* localStore.set('prefs', {
      ...state,
    }); */
    localStore.set('state', {
      ...state.gurmukhiKB,
      ...state.changelog,
    });
  }, 500),
);

export default store;
