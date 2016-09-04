var ipc = require("electron").ipcRenderer;
var fs = require('fs');
var bfr = fs.readFileSync('gurbani.sqlite');
    db = new SQL.Database(bfr);

function sendText(text) {
  ipc.send("show-line", {line: text})
}
