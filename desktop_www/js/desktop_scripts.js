const {remote}      = require("electron");
const ipc           = require("electron").ipcRenderer;
const fs            = require("fs");
const path          = require("path");

//If not in dev, DB path is outside of app.asar
let dbPath          = window.process.env.NODE_ENV != "development" ? "../../../" : "../../";
    dbPath          = path.resolve(__dirname, dbPath + "iGurbani.sqlite")

const sqlite3       = require("sqlite3").verbose();
      db            = new sqlite3.Database(dbPath);
const Store         = require("./store");
const defaultPrefs  = require("./defaults.json");

const store = new Store({
  configName: 'user-preferences',
  defaults: defaultPrefs
});

const $titleButtons = document.querySelectorAll("#titlebar .controls a");
Array.from($titleButtons).forEach(el => {
  el.addEventListener("click", e => windowAction(e));
});

function windowAction(e) {
  const win = remote.getCurrentWindow();
  const el = e.currentTarget;
  switch (el.dataset.windowAction) {
    case "minimize":
      win.minimize();
      break;
    case "max-restore":
      if (win.isMaximized()) {
        win.unmaximize();
        document.body.classList.remove("maximized");
      } else {
        win.maximize();
        document.body.classList.add("maximized");
      }
      break;
    case "close":
      win.close();
      break;
  }
}
module.exports = {
  ipc: ipc,
  db: db,
  store: store,

  getAllPrefs: function() {
    return this.getPref("userPrefs")
  },

  getUserPref: function(key) {
    return this.getPref("userPrefs." + key);
  },

  getPref: function(key, schema = store.data) {
    return store.get(key, schema);
  },

  setUserPref: function(key, val) {
    this.setPref("userPrefs." + key, val);
  },

  setPref: function(key, val) {
    store.set(key, val);
  },

  deletePref: function(key) {
    store.delete(key);
  }
}
