const ipc           = require("electron").ipcRenderer;
const fs            = require("fs");
const path          = require("path");

//If not in dev, DB path is outside of app.asar
let dbPath          = window.process.env.NODE_ENV != "development" ? "../../" : "../";
    dbPath          = path.resolve(__dirname, dbPath + "iGurbani.sqlite")

const sqlite3       = require("sqlite3").verbose();
      db            = new sqlite3.Database(dbPath);
const Store         = require("../desktop_www/js/store.js");
const defaultPrefs  = require("../desktop_www/js/defaults.json");

const store = new Store({
  configName: 'user-preferences',
  defaults: defaultPrefs
});

function getPref(key) {
  return store.get(key);
}
function setPref(key, val) {
  store.set(key, val);
}
function deletePref(key) {
  store.delete(key);
}
