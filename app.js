var electron        = require("electron");
var app             = require("app");
var BrowserWindow   = electron.BrowserWindow;
var ipc             = electron.ipcMain;
var appVersion      = require("./package.json").version;
var os              = require("os").platform();
const Store         = require("./desktop_www/js/store.js");
const defaultPrefs  = require("./desktop_www/js/defaults.json");
var mainWindow,
    viewerWindow,
    viewerWindowOpen  = false,
    viewerWindowX,
    viewerWindowY,
    viewerWindowFS;

const store = new Store({
  configName: 'user-preferences',
  defaults: defaultPrefs
});

if (require("electron-squirrel-startup")) return;
var autoUpdater = require("auto-updater");

autoUpdater.addListener("update-available", function() {
  mainWindow.webContents.send("updating");
});


autoUpdater.on("update-downloaded", function (e, releaseNotes, releaseName, releaseDate, updateURL) {
  autoUpdater.quitAndInstall();
});

app.on("ready", function () {
  let windowBounds = store.get("windowBounds");
  mainWindow = new BrowserWindow({
    width: windowBounds.width,
    height: windowBounds.height,
    x: windowBounds.x,
    y: windowBounds.y,
    show: false,
    titleBarStyle: "hidden"
  })
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.show();
    checkForUpdates();
  })
  mainWindow.loadURL("file://" + __dirname + "/www/index.html");
  function saveWindowBounds() {
    store.set('windowBounds', mainWindow.getBounds());
  }

  // listen to `resize` and `move` and save the settings
  mainWindow.on('resize', saveWindowBounds);
  mainWindow.on('move', saveWindowBounds);
});


// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
  //if (process.platform !== 'darwin') {
    app.quit();
  //}
});

function createViewer(ipcData) {
  checkForExternalDisplay();
  viewerWindow = new BrowserWindow({
    width       : 800,
    height      : 600,
    x           : viewerWindowX,
    y           : viewerWindowY,
    fullscreen  : viewerWindowFS,
    show        : false,
  });
  viewerWindow.loadURL("file://" + __dirname + "/desktop_www/viewer.html");
  viewerWindow.webContents.on("did-finish-load", () => {
    viewerWindow.show();
    viewerWindowOpen = true;
    if (typeof ipcData !== "undefined") {
      viewerWindow.webContents.send(ipcData.send, ipcData.data);
    }
  });
  viewerWindow.on("closed", () => {
    viewerWindowOpen = false;
    viewerWindow = null;
  });
}

function checkForExternalDisplay() {
  var electronScreen  = electron.screen;
  var displays        = electronScreen.getAllDisplays();
  var externalDisplay   = null;
  for (var i in displays) {
    if (displays[i].bounds.x != 0 || displays[i].bounds.y != 0) {
      externalDisplay = displays[i];
      break;
    }
  }

  if (externalDisplay) {
    viewerWindowX   = externalDisplay.bounds.x + 50;
    viewerWindowY   = externalDisplay.bounds.y + 50;
    viewerWindowFS  = true;
  } else {
    viewerWindowX   = 50;
    viewerWindowY   = 50;
    viewerWindowFS  = false;
  }
}

function checkForUpdates() {
  var updateFeed = "http://localhost:8000/";
  if (process.env.NODE_ENV !== "development") {
    updateFeed = "http://releases.khalis.net/";
  }
  updateFeed += os === "win32" ?
    "sttme-win32/" :
    "sttme/darwin/" + appVersion;

  autoUpdater.setFeedURL(updateFeed);
  autoUpdater.checkForUpdates();
}

ipc.on('show-line', function(event, arg) {
  if (viewerWindowOpen) {
    viewerWindow.webContents.send("show-line", arg);
  } else {
    createViewer({
      send: "show-line",
      data: arg
    });
  }
});

ipc.on("show-text", function(event, arg) {
  if (viewerWindowOpen) {
    viewerWindow.webContents.send("show-text", arg);
  } else {
    createViewer({
      send: "show-text",
      data: arg
    })
  }
});
