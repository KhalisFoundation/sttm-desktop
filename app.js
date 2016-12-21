const electron        = require("electron");
const app             = require("app");
const {BrowserWindow} = electron;
const ipc             = electron.ipcMain;
const appVersion      = require("./package.json").version;
const os              = require("os").platform();
let mainWindow,
    viewerWindow,
    viewerWindowOpen  = false,
    viewerWindowX     = 50,
    viewerWindowY     = 50,
    viewerWindowFS    = false;

if (require("electron-squirrel-startup")) return;
const autoUpdater   = require("auto-updater");

if (process.env.NODE_ENV !== "development") {
  updateFeed = "http://releases.khalis.net/sttme/" + os + "/";
  if (os === "darwin") {
    updateFeed += appVersion;
  }
  autoUpdater.setFeedURL("http://releases.khalis.net/sttme/darwin/" + appVersion);
}
autoUpdater.checkForUpdates();

autoUpdater.on("update-downloaded", function (e, releaseNotes, releaseName, releaseDate, updateURL) {
  alert("A new update is ready to install. Version " + releaseName + " is downloaded and will be automatically installed on Quit");
  autoUpdater.quitAndInstall();
});

app.on("ready", function () {
  const electronScreen  = electron.screen;
  const displays        = electronScreen.getAllDisplays();
  let externalDisplay   = null;
  for (var i in displays) {
    if (displays[i].bounds.x != 0 || displays[i].bounds.y != 0) {
      externalDisplay = displays[i];
      break;
    }
  }
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 600,
    show: false,
    titleBarStyle: "hidden"
  })
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('ready-to-show mainWindow');
    mainWindow.show();
  })
  mainWindow.loadURL("file://" + __dirname + "/www/index.html");

  if (externalDisplay) {
    viewerWindowX   = externalDisplay.bounds.x + 50,
    viewerWindowY   = externalDisplay.bounds.y + 50,
    viewerWindowFS  = true;
  }
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
  console.log(typeof ipcData);
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
