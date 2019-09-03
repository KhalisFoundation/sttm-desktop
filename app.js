const electron = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const express = require('express');
const fs = require('fs');
const path = require('path');
const uuid = require('uuid/v4');
const op = require('openport');
const Store = require('./www/js/store.js');
const defaultPrefs = require('./www/js/defaults.json');
const Analytics = require('./analytics');

// Are we packaging for a platform's app store?
const appstore = false;
const maxChangeLogSeenCount = 5;

const expressApp = express();
/* eslint-disable import/order */
const httpBase = require('http').Server(expressApp);
const http = require('http-shutdown')(httpBase);
const io = require('socket.io')(http);
/* eslint-enable */

expressApp.use(express.static(path.join(__dirname, 'www', 'obs')));

const { app, BrowserWindow, dialog, ipcMain } = electron;

const store = new Store({
  configName: 'user-preferences',
  defaults: defaultPrefs,
});

const appVersion = app.getVersion();

const overlayCast = store.getUserPref('app.overlay-cast');

let mainWindow;
let viewerWindow = false;
let startChangelogOpenTimer;
let endChangelogOpenTimer;
const secondaryWindows = {
  changelogWindow: {
    obj: false,
    url: `file://${__dirname}/www/changelog.html`,
    onClose: () => {
      const count = store.get('changelog-seen-count');
      endChangelogOpenTimer = new Date().getTime();
      store.set('changelog-seen', appVersion);
      store.set('changelog-seen-count', count + 1);
      global.analytics.trackEvent(
        'changelog',
        'closed',
        (endChangelogOpenTimer - startChangelogOpenTimer) / 1000.0,
      );
    },
    show: () => {
      startChangelogOpenTimer = new Date().getTime();
    },
  },
  helpWindow: {
    obj: false,
    url: `file://${__dirname}/www/help.html`,
  },
  overlayWindow: {
    obj: false,
    url: `file://${__dirname}/www/overlay.html`,
  },
  shortcutLegend: {
    obj: false,
    url: `file://${__dirname}/www/legend.html`,
  },
};
let manualUpdate = false;
const viewerWindowPos = {};

function openSecondaryWindow(windowName) {
  const window = secondaryWindows[windowName];
  const openWindow = BrowserWindow.getAllWindows().filter(item => item.getURL() === window.url);

  if (openWindow.length > 0) {
    openWindow[0].show();
  } else {
    window.obj = new BrowserWindow({
      width: 725,
      height: 800,
      show: false,
    });
    window.obj.webContents.on('did-finish-load', () => {
      window.obj.show();
      if (window.show) {
        window.show();
      }
    });
    window.obj.loadURL(window.url);

    window.obj.on('close', () => {
      window.obj = false;
      if (window.onClose) {
        window.onClose();
      }
    });
  }
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
      buttons: ['OK'],
      defaultId: 0,
      title: 'No update available.',
      message: 'No update available.',
      detail: `Version ${appVersion} is the latest version.`,
    });
  }
});
autoUpdater.on('update-downloaded', () => {
  mainWindow.webContents.send('update-downloaded');
  dialog.showMessageBox(
    {
      type: 'info',
      buttons: ['Dismiss', 'Install and Restart'],
      defaultId: 1,
      title: 'Update available.',
      message: 'Update available.',
      detail: 'Update downloaded and ready to install',
      cancelId: 0,
    },
    response => {
      if (response === 1) {
        autoUpdater.quitAndInstall();
      }
    },
  );
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
  Object.keys(displays).forEach(i => {
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
      frame: process.platform !== 'win32',
      backgroundColor: '#000000',
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
  mainWindow.webContents.send('presenter-view');
}

function createBroadcastFiles(arg) {
  const liveFeedLocation = store.get('userPrefs.app.live-feed-location');
  const userDataPath =
    liveFeedLocation === 'default' || !liveFeedLocation
      ? electron.app.getPath('desktop')
      : liveFeedLocation;
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

const showLine = (line, socket = io) => {
  const overlayPrefs = store.get('obs');
  const payload = Object.assign(line, overlayPrefs);
  if (!line.fromScroll) {
    socket.emit('show-line', payload);
  }
};

const updateOverlayVars = () => {
  const overlayPrefs = store.get('obs');
  io.emit('update-prefs', overlayPrefs);
};

const emptyOverlay = () => {
  const emptyLine = {
    Line: {
      Gurmukhi: '',
      English: '',
      Punjabi: '',
      Transliteration: '',
    },
  };
  showLine(emptyLine);
  const overlayPrefs = store.get('obs');
  if (overlayPrefs.live) {
    createBroadcastFiles(emptyLine);
  }
};

const shouldQuit = app.makeSingleInstance(() => {
  // Someone tried to run a second instance, we should focus our window.
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

const searchPorts = () => {
  op.find(
    {
      // Re: http://www.sikhiwiki.org/index.php/Gurgadi
      ports: [1397, 1469, 1539, 1552, 1574, 1581, 1606, 1644, 1661, 1665, 1675, 1708],
      count: 1,
    },
    (err, port) => {
      if (err) {
        dialog.showErrorBox(
          'Overlay Error',
          'No free ports available. Close other applications and Reboot the machine',
        );
        app.exit(-1);
        return;
      }
      global.overlayPort = port;
      // console.log(`Overlay Port No ${port}`);
      http.listen(port);
    },
  );
};

ipcMain.on('toggle-obs-cast', (event, arg) => {
  if (arg) {
    searchPorts();
  } else {
    http.shutdown();
  }
});

if (overlayCast) {
  searchPorts();
}

if (shouldQuit) {
  app.exit();
}

app.on('ready', () => {
  // Retrieve the userid value, and if it's not there, assign it a new uuid.
  let userId = store.get('userId');

  if (!userId) {
    userId = uuid();
    store.set('userId', userId);
  }
  const analytics = new Analytics(userId, store);
  global.analytics = analytics;

  const screens = electron.screen;
  const { width, height } = screens.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    minWidth: 800,
    minHeight: 600,
    width,
    height,
    frame: process.platform !== 'win32',
    show: false,
    backgroundColor: '#000000',
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
    // Platform-specific app stores have their own update mechanism
    // so only check if we're not in one
    if (!appstore) {
      checkForUpdates();
    }
    // Show changelog if last version wasn't seen
    const lastSeen = store.get('changelog-seen');
    const lastSeenCount = store.get('changelog-seen-count');
    const limitChangeLog = store.get('userPrefs.app.analytics.limit-changelog');

    if (lastSeen !== appVersion || (lastSeenCount < maxChangeLogSeenCount && !limitChangeLog)) {
      openSecondaryWindow('changelogWindow');
    }
    if (!viewerWindow) {
      createViewer();
    }
  });
  mainWindow.loadURL(`file://${__dirname}/www/index.html`);

  if (!store.get('user-agent')) {
    store.set('user-agent', mainWindow.webContents.getUserAgent());
  }

  // Close all other windows if closing the main
  mainWindow.on('close', () => {
    emptyOverlay();
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

let lastLine;

ipcMain.on('update-overlay-vars', updateOverlayVars);

io.on('connection', socket => {
  updateOverlayVars();
  if (lastLine) {
    showLine(lastLine, socket);
  }
});

ipcMain.on('show-line', (event, arg) => {
  lastLine = arg;
  showLine(arg);
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

ipcMain.on('show-empty-slide', () => {
  emptyOverlay();
});

ipcMain.on('show-text', (event, arg) => {
  const textLine = {
    Line: {
      Gurmukhi: arg.isGurmukhi ? arg.text : '',
      English: !arg.isGurmukhi ? arg.text : '',
      Punjabi: '',
      Transliteration: '',
    },
  };

  const emptyLine = {
    Line: {
      Gurmukhi: '',
      English: '',
      Punjabi: '',
      Transliteration: '',
    },
  };

  const announcementOverlay = store.getUserPref('app.announcement-overlay');
  if (arg.isAnnouncement && !announcementOverlay) {
    showLine(emptyLine);
  } else {
    showLine(textLine);
  }

  if (viewerWindow) {
    viewerWindow.webContents.send('show-text', arg);
  } else {
    createViewer({
      send: 'show-text',
      data: arg,
    });
  }
  if (arg.live) {
    createBroadcastFiles(arg);
  }
});

ipcMain.on('presenter-view', (event, arg) => {
  if (viewerWindow) {
    if (!arg) {
      viewerWindow.hide();
    } else {
      viewerWindow.show();
      viewerWindow.setFullScreen(true);
    }
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
  mainWindow.webContents.send('sync-settings');
});

module.exports = {
  openSecondaryWindow,
  appVersion,
  checkForUpdates,
  autoUpdater,
  store,
  appstore,
};
