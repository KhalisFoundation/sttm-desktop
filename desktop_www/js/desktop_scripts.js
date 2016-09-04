var ipc   = require("electron").ipcRenderer;
var fs    = require('fs');
var path  = require('path');
var file  = path.join(__dirname, "../gurbani.sqlite");
var bfr   = fs.readFileSync(file);
    db    = new SQL.Database(bfr);

function sendText(text) {
  ipc.send("show-line", {line: text})
}
