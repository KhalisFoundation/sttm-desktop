import LocalStore from 'electron-store';
import throttle from 'lodash.throttle';
import configureStore from '../shared/configureStore';

const localStore = new LocalStore();
const initialState = localStore.get('state');

const store = configureStore(initialState);

// Regularly save the app state to the local store file
store.subscribe(
  throttle(() => {
    const state = store.getState();
    localStore.set('state', {
      changelog: state.changelog,
      gurmukhiKB: state.gurmukhiKB,
      searchOptions: state.searchOptions,
    });
  }, 500),
);

export default store;
