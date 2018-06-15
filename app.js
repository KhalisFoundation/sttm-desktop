const electron = require('electron');
const Store = require('./www/js/store.js');
const defaultPrefs = require('./www/js/defaults.json');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const express = require('express');
const fs = require('fs');
const path = require('path');

const expressApp = express();

const http = require('http').Server(expressApp);
const io = require('socket.io')(http);

expressApp.use(express.static(path.join(__dirname, 'www', 'obs')));

http.listen(1397); // TODO: move to config file

const { app, BrowserWindow, dialog, ipcMain } = electron;
const store = new Store({
  configName: 'user-preferences',
  defaults: defaultPrefs,
});
const appVersion = app.getVersion();

let mainWindow;
let viewerWindow = false;
const secondaryWindows = {
  changelogWindow: {
    obj: false,
    url: `file://${__dirname}/www/changelog.html`,
    onClose: () => { store.set('changelog-seen', appVersion); },
  },
  helpWindow: {
    obj: false,
    url: `file://${__dirname}/www/help.html`,
  },
  overlayWindow: {
    obj: false,
    url: `file://${__dirname}/www/overlay.html`,
  },
};
let manualUpdate = false;
const viewerWindowPos = {};

function openSecondaryWindow(windowName) {
  const window = secondaryWindows[windowName];
  window.obj = new BrowserWindow({
    width: 725,
    height: 800,
    show: false,
  });
  window.obj.webContents.on('did-finish-load', () => {
    window.obj.show();
  });
  window.obj.loadURL(window.url);

  window.obj.on('close', () => {
    window.obj = false;
    if (window.onClose) {
      window.onClose();
    }
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
      height: 400,
      x: viewerWindowPos.x,
      y: viewerWindowPos.y,
      autoHideMenuBar: true,
      show: false,
      titleBarStyle: 'hidden',
      frame: (process.platform !== 'win32'),
    });
    viewerWindow.loadURL(`file://${__dirname}/www/viewer.html`);
    viewerWindow.webContents.on('did-finish-load', () => {
      viewerWindow.show();
      const [width, height] = viewerWindow.getSize();
      mainWindow.webContents.send('external-display', {
        width,
        height,
      });
      mainWindow.focus();
      viewerWindow.setFullScreen(true);
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
      mainWindow.webContents.send('remove-external-display');
    });
    viewerWindow.on('resize', () => {
      const [width, height] = viewerWindow.getSize();
      mainWindow.webContents.send('external-display', {
        width,
        height,
      });
    });
  }
}

app.on('ready', () => {
  const screens = electron.screen;
  const { width, height } = screens.getPrimaryDisplay().workAreaSize;
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
      mainWindow.webContents.send('external-display', {
        width: viewerWindowPos.w,
        height: viewerWindowPos.h,
      });
    }
    mainWindow.show();
    checkForUpdates();
    // Show changelog if last version wasn't seen
    const lastSeen = store.get('changelog-seen');
    if (lastSeen !== appVersion) {
      openSecondaryWindow('changelogWindow');
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
    const changelogWindow = secondaryWindows.changelogWindow.obj;
    if (changelogWindow && !changelogWindow.isDestroyed()) {
      changelogWindow.close();
    }
  });

  // When a display is connected, add a viewer window if it does not already exit
  screens.on('display-added', () => {
    if (!viewerWindow) {
      createViewer();
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

ipcMain.on('cast-session-active', () => {
  mainWindow.webContents.send('cast-session-active');
});

ipcMain.on('cast-session-stopped', () => {
  mainWindow.webContents.send('cast-session-stopped');
});

ipcMain.on('checkForUpdates', checkForUpdates);
ipcMain.on('quitAndInstall', () => autoUpdater.quitAndInstall());

ipcMain.on('clear-apv', () => {
  if (viewerWindow) {
    viewerWindow.webContents.send('clear-apv');
  }
});

function createBroadcastFiles(arg) {
  const userDataPath = electron.app.getPath('userData');
  const gurbaniFile = `${userDataPath}/sttm-Gurbani.txt`;
  const englishFile = `${userDataPath}/sttm-English.txt`;
  try {
    fs.writeFile(gurbaniFile, arg.Line.Gurmukhi.trim());
    fs.appendFile(gurbaniFile, '\n');
    fs.writeFile(englishFile, arg.Line.English.trim());
    fs.appendFile(englishFile, '\n');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(err);
  }
}

ipcMain.on('show-line', (event, arg) => {
  const overlayPrefs = store.get('obs');
  const payload = Object.assign(arg, overlayPrefs);
  io.emit('show-line', payload);
  if (viewerWindow) {
    viewerWindow.webContents.send('show-line', arg);
  } else {
    createViewer({
      send: 'show-line',
      data: arg,
    });
  }
  if (arg.live) {
    createBroadcastFiles(arg);
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

ipcMain.on('scroll-from-main', (event, arg) => {
  if (viewerWindow) {
    viewerWindow.webContents.send('send-scroll', arg);
  }
});

ipcMain.on('next-ang', (event, arg) => {
  if (viewerWindow) {
    viewerWindow.webContents.send('show-ang', arg);
  }
  mainWindow.webContents.send('next-ang', arg);
});

ipcMain.on('scroll-pos', (event, arg) => {
  mainWindow.webContents.send('send-scroll', arg);
});

ipcMain.on('update-settings', () => {
  if (viewerWindow) {
    viewerWindow.webContents.send('update-settings');
  }
});

module.exports = {
  openSecondaryWindow,
  appVersion,
  checkForUpdates,
  autoUpdater,
  store,
};
