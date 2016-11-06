var ipc     = require("electron").ipcRenderer;
var fs      = require("fs");
var path    = require("path");
var file    = path.join(__dirname, dbPath + "iGurbani.sqlite");
var bfr     = fs.readFileSync(file);
    db      = new SQL.Database(bfr);

function sendLine(lineID) {
  ipc.send("show-line", {lineID: lineID});
}
function sendText(text) {
  ipc.send("show-text", {text: text});
}
