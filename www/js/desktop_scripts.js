const electron = require('electron');
const AdmZip = require('adm-zip');
const fs = require('fs');
const isOnline = require('is-online');
const path = require('path');
const request = require('request');
const progress = require('request-progress');
const sqlite3 = require('sqlite3').verbose();

const defaultPrefs = require('./defaults.json');
const search = require('./search-database');
const Store = require('./store');

const { remote } = electron;
const ipc = electron.ipcRenderer;
const userDataPath = remote.app.getPath('userData');
const dbPath = path.resolve(userDataPath, 'data.db');

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
  search,
  store,

  init() {
    // Initialize DB right away if it exists
    if (fs.existsSync(dbPath)) {
      this.initDB();
      // Check if there's a newer version
      this.downloadLatestDB();
    } else {
      // Download the DB
      this.downloadLatestDB(true);
    }
  },

  downloadLatestDB(force = false) {
    if (force) {
      global.core.search.$search.placeholder = 'Downloading database...';
    }
    isOnline().then((online) => {
      if (online) {
        request('https://khajana.org/data.md5', (error, response, newestDBHash) => {
          if (!error && response.statusCode === 200) {
            const curDBHash = module.exports.getPref('curDBHash');
            if (force || curDBHash !== newestDBHash) {
              const dbZip = path.resolve(userDataPath, 'data.zip');
              progress(request('https://khajana.org/data.zip'))
                .on('progress', (state) => {
                  const win = remote.getCurrentWindow();
                  win.setProgressBar(state.percent);
                  global.core.search.updateDLProgress(state);
                })
                .on('end', () => {
                  const zip = new AdmZip(dbZip);
                  zip.extractEntryTo('data.db', userDataPath, true, true);
                  module.exports.initDB();
                  module.exports.setPref('curDBHash', newestDBHash);
                  fs.unlinkSync(dbZip);
                  const win = remote.getCurrentWindow();
                  win.setProgressBar(-1);
                })
                .pipe(fs.createWriteStream(dbZip));
            }
          }
        });
      } else if (force) {
        global.core.search.offline(10);
      }
    });
  },

  initDB() {
    const db = new sqlite3.Database(dbPath);
    this.db = db;
    search.db = db;
    if (global.core) {
      global.core.search.initSearch();
    }
  },

  updateSettings() {
    global.webview.send('update-settings');
    global.platform.ipc.send('update-settings');
  },

  updateTheme() {
    global.webview.send('update-theme');
    global.platform.ipc.send('update-theme');
  },

  getAllPrefs(schema = store.data) {
    return this.getPref('userPrefs', schema);
  },

  getDefaults() {
    return store.getDefaults();
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
