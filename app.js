const electron = require('electron');
const Store = require('./www/js/store.js');
const defaultPrefs = require('./www/js/defaults.json');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

const { app, BrowserWindow, dialog, ipcMain } = electron;
const store = new Store({
  configName: 'user-preferences',
  defaults: defaultPrefs,
});
const appVersion = app.getVersion();

let mainWindow;
let viewerWindow = false;
let changelogWindow = false;
let manualUpdate = false;
const viewerWindowPos = {};

function openChangelog() {
  changelogWindow = new BrowserWindow({
    width: 725,
    height: 800,
    show: false,
  });
  changelogWindow.webContents.on('did-finish-load', () => {
    changelogWindow.show();
  });
  changelogWindow.loadURL(`file://${__dirname}/www/changelog.html`);

  // Update changelog last seen pref when seen
  changelogWindow.on('close', () => {
    store.set('changelog-seen', appVersion);
    changelogWindow = false;
  });
}

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// autoUpdater events
autoUpdater.on('checking-for-update', () => {
  mainWindow.webContents.send('checking-for-update');
});
autoUpdater.on('update-available', () => {
  mainWindow.webContents.send('update-available');
});
autoUpdater.on('update-not-available', () => {
  mainWindow.webContents.send('update-not-available');
  if (manualUpdate) {
    dialog.showMessageBox({
      type: 'info',
      buttons: [
        'OK',
      ],
      defaultId: 0,
      title: 'No update available.',
      message: 'No update available.',
      detail: `Version ${appVersion} is the latest version.`,
    });
  }
});
autoUpdater.on('update-downloaded', () => {
  mainWindow.webContents.send('update-downloaded');
  dialog.showMessageBox({
    type: 'info',
    buttons: [
      'Dismiss',
      'Install & Restart',
    ],
    defaultId: 1,
    title: 'Update available.',
    message: 'Update available.',
    detail: 'Update downloaded and ready to install',
    cancelId: 0,
  }, (response) => {
    if (response === 1) {
      autoUpdater.quitAndInstall();
    }
  });
});
autoUpdater.on('error', () => {
  if (manualUpdate) {
    // showUpdate('update-error');
  }
});

function checkForUpdates(manual = false) {
  if (process.env.NODE_ENV !== 'development') {
    if (manual) {
      manualUpdate = true;
    }
    autoUpdater.checkForUpdates();
  }
}

function checkForExternalDisplay() {
  const electronScreen = electron.screen;
  const displays = electronScreen.getAllDisplays();
  let externalDisplay = null;
  Object.keys(displays).forEach((i) => {
    if (displays[i].bounds.x !== 0 || displays[i].bounds.y !== 0) {
      externalDisplay = displays[i];
    }
  });

  if (externalDisplay) {
    viewerWindowPos.x = externalDisplay.bounds.x + 50;
    viewerWindowPos.y = externalDisplay.bounds.y + 50;
    viewerWindowPos.w = externalDisplay.size.width;
    viewerWindowPos.h = externalDisplay.size.height;
    return true;
  }
  return false;
}

function createViewer(ipcData) {
  const isExternal = checkForExternalDisplay();
  if (isExternal) {
    viewerWindow = new BrowserWindow({
      width: 800,
      height: 600,
      x: viewerWindowPos.x,
      y: viewerWindowPos.y,
      fullscreen: true,
      autoHideMenuBar: true,
      show: false,
      titleBarStyle: 'hidden',
      frame: (process.platform !== 'win32'),
    });
    viewerWindow.loadURL(`file://${__dirname}/www/viewer.html`);
    viewerWindow.webContents.on('did-finish-load', () => {
      viewerWindow.show();
      const [width, height] = viewerWindow.getSize();
      mainWindow.webContents.send('presenter-view', {
        width,
        height,
      });
      mainWindow.focus();
      if (typeof ipcData !== 'undefined') {
        viewerWindow.webContents.send(ipcData.send, ipcData.data);
      }
    });
    viewerWindow.on('enter-full-screen', () => {
      mainWindow.focus();
    });
    viewerWindow.on('focus', () => {
      // mainWindow.focus();
    });
    viewerWindow.on('closed', () => {
      viewerWindow = false;
      mainWindow.webContents.send('remove-presenter-view');
    });
    viewerWindow.on('resize', () => {
      const [width, height] = viewerWindow.getSize();
      mainWindow.webContents.send('presenter-view', {
        width,
        height,
      });
    });
  }
}

app.on('ready', () => {
  const { width, height } = electron.screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    minWidth: 800,
    minHeight: 600,
    width,
    height,
    frame: (process.platform !== 'win32'),
    show: false,
    titleBarStyle: 'hidden',
  });
  mainWindow.webContents.on('did-finish-load', () => {
    if (checkForExternalDisplay()) {
      mainWindow.webContents.send('presenter-view', {
        width: viewerWindowPos.w,
        height: viewerWindowPos.h,
      });
    }
    mainWindow.show();
    checkForUpdates();
    // Show changelog if last version wasn't seen
    const lastSeen = store.get('changelog-seen');
    if (lastSeen !== appVersion) {
      openChangelog();
    }
    if (!viewerWindow) {
      createViewer();
    }
  });
  mainWindow.loadURL(`file://${__dirname}/www/index.html`);

  // Close all other windows if closing the main
  mainWindow.on('close', () => {
    if (viewerWindow && !viewerWindow.isDestroyed()) {
      viewerWindow.close();
    }
    if (changelogWindow && !changelogWindow.isDestroyed()) {
      changelogWindow.close();
    }
  });
});


// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
  // if (process.platform !== 'darwin') {
  app.quit();
  // }
});

ipcMain.on('checkForUpdates', checkForUpdates);
ipcMain.on('quitAndInstall', () => autoUpdater.quitAndInstall());

ipcMain.on('show-line', (event, arg) => {
  if (viewerWindow) {
    viewerWindow.webContents.send('show-line', arg);
  } else {
    createViewer({
      send: 'show-line',
      data: arg,
    });
  }
});

ipcMain.on('show-text', (event, arg) => {
  if (viewerWindow) {
    viewerWindow.webContents.send('show-text', arg);
  } else {
    createViewer({
      send: 'show-text',
      data: arg,
    });
  }
});

ipcMain.on('update-settings', () => {
  if (viewerWindow) {
    viewerWindow.webContents.send('update-settings');
  }
});

exports.openChangelog = openChangelog;
exports.appVersion = appVersion;
exports.checkForUpdates = checkForUpdates;
exports.autoUpdater = autoUpdater;
