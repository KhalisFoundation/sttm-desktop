var ipc     = require("electron").ipcRenderer;
var fs      = require("fs");
var path    = require("path");
var sqlite3 = require("sqlite3").verbose();
    db      = new sqlite3.Database(dbPath + "iGurbani.sqlite");

function sendLine(lineID) {
  ipc.send("show-line", {lineID: lineID});
}
function sendText(text) {
  ipc.send("show-text", {text: text});
}
