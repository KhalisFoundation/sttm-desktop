var ipc     = require("electron").ipcRenderer;
var fs      = require("fs");
var path    = require("path");
var dbPath  = path.resolve(__dirname, dbPath + "iGurbani.sqlite")
var sqlite3 = require("sqlite3").verbose();
    db      = new sqlite3.Database(dbPath);

function sendLine(lineID) {
  ipc.send("show-line", {lineID: lineID});
}
function sendText(text) {
  ipc.send("show-text", {text: text});
}
ipc.on("updating", function(event, data) {
  document.body.classList.add("updating");
})
