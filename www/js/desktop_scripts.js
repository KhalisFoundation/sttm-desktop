const electron = require('electron');
const defaultPrefs = require('./defaults.json');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const Store = require('./store');
const search = require('./search');

const { remote } = electron;
const ipc = electron.ipcRenderer;

// If not in dev, DB path is outside of app.asar
let dbPath = window.process.env.NODE_ENV !== 'development' ? '../../../' : '../../';
dbPath = path.resolve(__dirname, `${dbPath}data.db`);

const db = new sqlite3.Database(dbPath);
search.db = db;

const store = new Store({
  configName: 'user-preferences',
  defaults: defaultPrefs,
});

function windowAction(e) {
  const win = remote.getCurrentWindow();
  const el = e.currentTarget;
  switch (el.dataset.windowAction) {
    case 'minimize':
      win.minimize();
      break;
    case 'max-restore':
      if (win.isMaximized()) {
        win.unmaximize();
        document.body.classList.remove('maximized');
      } else {
        win.maximize();
        document.body.classList.add('maximized');
      }
      break;
    case 'close':
      win.close();
      break;
    default:
      break;
  }
}
module.exports = {
  ipc,
  db,
  search,
  store,

  getAllPrefs(schema = store.data) {
    return this.getPref('userPrefs', schema);
  },

  getUserPref(key) {
    return this.getPref(`userPrefs.${key}`);
  },

  getPref(key, schema = store.data) {
    return store.get(key, schema);
  },

  setUserPref(key, val) {
    this.setPref(`userPrefs.${key}`, val);
  },

  setPref(key, val) {
    store.set(key, val);
  },

  deletePref(key) {
    store.delete(key);
  },
};

const $titleButtons = document.querySelectorAll('#titlebar .controls a');
Array.from($titleButtons).forEach((el) => {
  el.addEventListener('click', e => windowAction(e));
});
