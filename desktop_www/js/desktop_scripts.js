var ipc     = require("electron").ipcRenderer;
var fs      = require("fs");
var path    = require("path");
var dbPath  = path.resolve(__dirname, dbPath + "iGurbani.sqlite")
var sqlite3 = require("sqlite3").verbose();
    db      = new sqlite3.Database(dbPath);
const Store   = require("../desktop_www/js/store.js");
const defaultPrefs = require("../desktop_www/js/defaults.json");

const store = new Store({
  configName: 'user-preferences',
  defaults: defaultPrefs
});

function sendLine(lineID) {
  ipc.send("show-line", {lineID: lineID});
}
function sendText(text) {
  ipc.send("show-text", {text: text});
}
ipc.on("updating", function(event, data) {
  document.body.classList.add("updating");
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
