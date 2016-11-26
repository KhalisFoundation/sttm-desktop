var electron      = require("electron");
var app           = require("app");
var BrowserWindow = require("browser-window");
var ipc           = require("electron").ipcMain;
var autoUpdater   = require("auto-updater");
var appVersion    = require("./package.json").version;
var os            = require("os").platform();
var mainWindow, viewerWindow;

autoUpdater.setFeedURL("http://releases.khalis.net/sttme/darwin/" + appVersion);
autoUpdater.checkForUpdates();

autoUpdater.on("update-downloaded", function () {
  autoUpdater.quitAndInstall();
});

app.on("ready", function () {
  var electronScreen = electron.screen;
  var displays = electronScreen.getAllDisplays();
  var externalDisplay = null;
  for (var i in displays) {
    if (displays[i].bounds.x != 0 || displays[i].bounds.y != 0) {
      externalDisplay = displays[i];
      break;
    }
  }
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600
  })
  mainWindow.loadURL("file://" + __dirname + "/www/index.html");

  viewerWindow = new BrowserWindow({
    width: 800,
    height: 600,
    x: 50,
    y: 50,
    //x: externalDisplay.bounds.x + 50,
    //y: externalDisplay.bounds.y + 50,
    //fullscreen: true,
  });
  viewerWindow.loadURL("file://" + __dirname + "/desktop_www/viewer.html");
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
  //if (process.platform !== 'darwin') {
    app.quit();
  //}
});

ipc.on('show-line', function(event, arg) {
  console.log('show-line app.js');
  viewerWindow.webContents.send('show-line', arg);
});

ipc.on("show-text", function(event, arg) {
  console.log("show-text app.js");
  viewerWindow.webContents.send("show-text", arg);
});
