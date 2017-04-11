/* eslint import/no-extraneous-dependencies: 0, import/no-unresolved: 0, global-require:0 */
const electron = require('electron');
const Store = require('./www/js/store.js');
const defaultPrefs = require('./www/js/defaults.json');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

const { app, BrowserWindow, ipcMain, Menu } = electron;
const store = new Store({
  configName: 'user-preferences',
  defaults: defaultPrefs,
});
const appVersion = app.getVersion();

let mainWindow;
let viewerWindow = false;
let changelogWindow = false;
let viewerWindowX;
let viewerWindowY;
let viewerWindowFS;

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// autoUpdater events
autoUpdater.on('checking-for-update', () => {
  mainWindow.webContents.send('checking-for-update');
});
autoUpdater.on('update-available', () => {
  mainWindow.webContents.send('updating');
});
autoUpdater.on('update-not-available', () => {
  mainWindow.webContents.send('no-update');
});
autoUpdater.on('update-downloaded', () => {
  mainWindow.webContents.send('updateReady');
});
autoUpdater.on('error', () => {
  mainWindow.webContents.send('update-error');
});

function checkForUpdates() {
  if (process.env.NODE_ENV !== 'development') {
    autoUpdater.checkForUpdates();
  }
}

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

app.on('ready', () => {
  const { width, height } = electron.screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    minWidth: 320,
    minHeight: 480,
    width,
    height,
    frame: (process.platform !== 'win32'),
    show: false,
    titleBarStyle: 'hidden',
  });
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.show();
    checkForUpdates();
    // Show changelog if last version wasn't seen
    const lastSeen = store.get('changelog-seen');
    if (lastSeen !== appVersion) {
      openChangelog();
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

  // macOS Menu
  if (process.platform === 'darwin') {
    const template = [
      {
        label: 'SikhiToTheMax',
        submenu: [
          {
            label: 'About SikhiToTheMax',
            role: 'about',
          },
          {
            label: 'Check for Updates...',
            accelerator: 'Cmd+U',
            click: () => {
              checkForUpdates();
            },
          },
          {
            label: 'Changelog...',
            click: () => {
              openChangelog();
            },
          },
          {
            type: 'separator',
          },
          {
            label: 'Preferences',
            accelerator: 'Cmd+,',
            click: () => {
              mainWindow.webContents.send('openSettings');
            },
          },
          {
            type: 'separator',
          },
          {
            label: 'Services',
            role: 'services',
            submenu: [],
          },
          {
            type: 'separator',
          },
          {
            label: 'Hide SikhiToTheMax',
            accelerator: 'Cmd+H',
            role: 'hide',
          },
          {
            label: 'Hide Others',
            accelerator: 'Cmd+Alt+H',
            role: 'hideothers',
          },
          {
            type: 'separator',
          },
          {
            label: 'Quit SikhiToTheMax',
            accelerator: 'CmdOrCtrl+Q',
            click: () => {
              app.quit();
            },
          },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          {
            label: 'Undo',
            accelerator: 'CmdOrCtrl+Z',
            role: 'undo',
          },
          {
            label: 'Redo',
            accelerator: 'CmdOrCtrl+Shift+Z',
            role: 'redo',
          },
          {
            type: 'separator',
          },
          {
            label: 'Cut',
            accelerator: 'CmdOrCtrl+X',
            role: 'cut',
          },
          {
            label: 'Copy',
            accelerator: 'CmdOrCtrl+C',
            role: 'copy',
          },
          {
            label: 'Paste',
            accelerator: 'CmdOrCtrl+V',
            role: 'paste',
          },
          {
            label: 'Select All',
            accelerator: 'CmdOrCtrl+A',
            role: 'selectall',
          },
        ],
      },
      {
        label: 'Window',
        role: 'window',
        submenu: [
          {
            label: 'Minimize',
            accelerator: 'CmdOrCtrl+M',
            role: 'minimize',
          },
          {
            label: 'Close',
            accelerator: 'CmdOrCtrl+W',
            role: 'close',
          },
        ],
      },
    ];
    if (process.env.NODE_ENV === 'development') {
      template.push({
        label: 'Dev',
        submenu: [
          {
            label: 'Toggle Developer Tools',
            accelerator: 'CmdOrCtrl+Alt+I',
            click: () => {
              mainWindow.webContents.toggleDevTools();
            },
          },
          {
            label: 'Reload',
            accelerator: 'CmdOrCtrl+R',
            click: () => {
              mainWindow.webContents.reload();
            },
          },
        ],
      });
    }
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }
});


// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
  // if (process.platform !== 'darwin') {
  app.quit();
  // }
});

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
    viewerWindowX = externalDisplay.bounds.x + 50;
    viewerWindowY = externalDisplay.bounds.y + 50;
    viewerWindowFS = true;
  } else {
    viewerWindowX = 50;
    viewerWindowY = 50;
    viewerWindowFS = false;
  }
}

function createViewer(ipcData) {
  checkForExternalDisplay();
  viewerWindow = new BrowserWindow({
    width: 800,
    height: 600,
    x: viewerWindowX,
    y: viewerWindowY,
    fullscreen: viewerWindowFS,
    autoHideMenuBar: true,
    show: false,
    titleBarStyle: 'hidden',
    frame: (process.platform !== 'win32'),
  });
  viewerWindow.loadURL(`file://${__dirname}/desktop_www/viewer.html`);
  viewerWindow.webContents.on('did-finish-load', () => {
    viewerWindow.show();
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
  });
}

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

ipcMain.on('openChangelog', openChangelog);
