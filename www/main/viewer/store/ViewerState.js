import { createStore } from 'easy-peasy';
import GlobalState from '../../common/store/GlobalState';

const { ipcRenderer } = require('electron');

// ipcRenderer.on('new-setting-dispatch', )

ipcRenderer.on('new-setting-dispatch', (event, setting) => {
  // const { state, payload, oldValue, action } = setting;
  console.log('setting', setting);
  // checking typeof savedSettings[key] so that classs should not apply while custom background
});

const ViewerState = createStore({
  userSettings: {
    ...GlobalState.getState().userSettings,
    ...GlobalState.getActions().userSettings,
  },
});

export default ViewerState;
