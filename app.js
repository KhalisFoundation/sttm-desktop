/* eslint import/no-extraneous-dependencies: 0, import/no-unresolved: 0, global-require:0 */
const electron = require('electron');
const Store = require('./desktop_www/js/store.js');
const defaultPrefs = require('./desktop_www/js/defaults.json');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

const { app, BrowserWindow, ipcMain, Menu } = electron;
const store = new Store({
  configName: 'user-preferences',
  defaults: defaultPrefs,
});

let mainWindow;
let viewerWindow;
let viewerWindowOpen = false;
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

app.on('ready', () => {
  const windowBounds = store.get('windowBounds');
  mainWindow = new BrowserWindow({
    minWidth: 320,
    minHeight: 480,
    width: windowBounds.width,
    height: windowBounds.height,
    x: windowBounds.x,
    y: windowBounds.y,
    frame: (process.platform !== 'win32'),
    show: false,
    titleBarStyle: 'hidden',
  });
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.show();
    checkForUpdates();
  });
  mainWindow.loadURL(`file://${__dirname}/www/index.html`);
  function saveWindowBounds() {
    store.set('windowBounds', mainWindow.getBounds());
  }

  // listen to `resize` and `move` and save the settings
  mainWindow.on('resize', saveWindowBounds);
  mainWindow.on('move', saveWindowBounds);

  // Close all other windows if closing the main
  mainWindow.on('close', () => {
    if (viewerWindowOpen) {
      viewerWindow.close();
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
    viewerWindowOpen = true;
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
    viewerWindowOpen = false;
    viewerWindow = null;
  });
}

ipcMain.on('checkForUpdates', checkForUpdates);
ipcMain.on('quitAndInstall', () => autoUpdater.quitAndInstall());

ipcMain.on('show-line', (event, arg) => {
  if (viewerWindowOpen) {
    viewerWindow.webContents.send('show-line', arg);
  } else {
    createViewer({
      send: 'show-line',
      data: arg,
    });
  }
});

ipcMain.on('show-text', (event, arg) => {
  if (viewerWindowOpen) {
    viewerWindow.webContents.send('show-text', arg);
  } else {
    createViewer({
      send: 'show-text',
      data: arg,
    });
  }
});
