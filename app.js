const electron = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const express = require('express');
const fs = require('fs');
const path = require('path');
const uuid = require('uuid/v4');
const op = require('openport');
const i18n = require('i18next');
const i18nBackend = require('i18next-node-fs-backend');
const os = require('os');
const fetch = require('node-fetch');

// eslint-disable-next-line import/no-unresolved
const Store = require('./www/js/store.js');
const defaultPrefs = require('./www/configs/defaults.json');
const themes = require('./www/configs/themes.json');
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

const platform = os.platform();
let isUnsupportedWindow = false;
if (platform === 'win32') {
  const version = /\d+\.\d/.exec(os.release())[0];
  if (version !== '6.3' && version !== '10.0') {
    isUnsupportedWindow = true;
  }
}

// Configuring the i18n
i18n.use(i18nBackend);
i18n.init({
  backend: {
    loadPath: path.join(__dirname, './www/locales/{{lng}}.json'),
    jsonIndent: 2,
  },
  fallbackLng: 'en',
});

expressApp.use(express.static(path.join(__dirname, 'www', 'obs')));

const { app, BrowserWindow, dialog, ipcMain } = electron;

const store = new Store({
  configName: 'user-preferences',
  defaults: defaultPrefs,
});

const appVersion = app.getVersion();

const overlayCast = store.getUserPref('app.overlay-cast');

// Reset to default theme if theme not found
const currentTheme = themes.find(theme => theme.key === store.getUserPref('app.theme'));
if (currentTheme === undefined) {
  store.setUserPref('app.theme', themes[0].key);
}

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
      width: 1366,
      height: 768,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        webviewTag: true,
      },
    });
    window.obj.webContents.on('did-finish-load', () => {
      window.obj.show();
      window.obj.focus();
      if (window.show) {
        window.show();
      }
      if (window.focus) {
        window.focus();
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
  if (!isUnsupportedWindow) {
    mainWindow.webContents.send('checking-for-update');
  }
});
autoUpdater.on('update-available', () => {
  if (!isUnsupportedWindow) {
    mainWindow.webContents.send('update-available');
  }
});
autoUpdater.on('update-not-available', () => {
  if (!isUnsupportedWindow) {
    mainWindow.webContents.send('update-not-available');
    if (manualUpdate) {
      dialog.showMessageBox({
        type: 'info',
        buttons: [i18n.t('OK')],
        defaultId: 0,
        title: i18n.t('NO_UPDATE_AVAILABLE'),
        message: i18n.t('NO_UPDATE_AVAILABLE'),
        detail: i18n.t('LATEST_VERSION', { appVersion }),
      });
    }
  }
});
autoUpdater.on('update-downloaded', () => {
  if (!isUnsupportedWindow) {
    mainWindow.webContents.send('update-downloaded');
    dialog.showMessageBox(
      {
        type: 'info',
        buttons: [i18n.t('DISMISS'), i18n.t('INSTALL_N_RESTART')],
        defaultId: 1,
        title: i18n.t('UPDATE_AVAILABLE'),
        message: i18n.t('UPDATE_AVAILABLE'),
        detail: i18n.t('UPDATE_DOWNLOADED'),
        cancelId: 0,
      },
      response => {
        if (response === 1) {
          autoUpdater.quitAndInstall();
        }
      },
    );
  }
});
autoUpdater.on('error', () => {
  if (!isUnsupportedWindow) {
    if (manualUpdate) {
      dialog.showMessageBox({
        type: 'error',
        buttons: [i18n.t('OK')],
        defaultId: 0,
        title: i18n.t('SOMETHING_WENT_WRONG_UPDATE_TITLE'),
        message: i18n.t('SOMETHING_WENT_WRONG_UPDATE_BODY'),
        detail: i18n.t('CURRENT_VERSION', { appVersion }),
      });
    }
  }
});

function checkForUpdates(manual = false) {
  if (process.env.NODE_ENV !== 'development') {
    if (manual) {
      manualUpdate = true;
    }
    if (!isUnsupportedWindow) {
      autoUpdater.checkForUpdatesAndNotify();
    }
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

function showChangelog() {
  const lastSeen = store.get('changelog-seen');
  const lastSeenCount = store.get('changelog-seen-count');
  const limitChangeLog = store.get('userPrefs.app.analytics.limit-changelog');

  return lastSeen !== appVersion || (lastSeenCount < maxChangeLogSeenCount && !limitChangeLog);
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
      webPreferences: {
        nodeIntegration: true,
        webviewTag: true,
      },
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
      if (showChangelog() && secondaryWindows.changelogWindow.obj) {
        secondaryWindows.changelogWindow.obj.focus();
      }
      viewerWindow.setFullScreen(true);
      if (typeof ipcData !== 'undefined') {
        viewerWindow.webContents.send(ipcData.send, ipcData.data);
      }
    });
    viewerWindow.on('enter-full-screen', () => {
      mainWindow.focus();
      if (showChangelog() && secondaryWindows.changelogWindow.obj) {
        secondaryWindows.changelogWindow.obj.focus();
      }
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

function writeFileCallback(err) {
  if (err) {
    throw err;
  }
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
    fs.writeFile(gurbaniFile, arg.Line.Gurmukhi.trim(), writeFileCallback);
    fs.appendFile(gurbaniFile, '\n', writeFileCallback);
    fs.writeFile(englishFile, arg.Line.English.trim(), writeFileCallback);
    fs.appendFile(englishFile, '\n', writeFileCallback);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(err);
  }
}

let seq = Math.floor(Math.random() * 100);

const showLine = async (line, socket = io) => {
  const overlayPrefs = store.get('obs');
  const lineWithSettings = line;
  lineWithSettings.languageSettings = {
    translation: store.getUserPref('slide-layout.language-settings.translation-language'),
    transliteration: store.getUserPref('slide-layout.language-settings.transliteration-language'),
  };

  const payload = Object.assign(lineWithSettings, overlayPrefs);
  if (!lineWithSettings.fromScroll) {
    socket.emit('show-line', payload);
  }
  const zoomToken = store.get('userPrefs.app.zoomToken');
  if (zoomToken) {
    try {
      await fetch(`${zoomToken}&seq=${seq}`, {
        method: 'POST',
        body: `${line.Line.Unicode}\n`,
      });
      seq += 1;
    } catch (e) {
      // TODO: zoom recommends retrying 4XX responses.
      log(e);
    }
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

const singleInstanceLock = app.requestSingleInstanceLock();

const searchPorts = () => {
  op.find(
    {
      // Re: http://www.sikhiwiki.org/index.php/Gurgadi
      ports: [1397, 1469, 1539, 1552, 1574, 1581, 1606, 1644, 1661, 1665, 1675, 1708],
      count: 1,
    },
    (err, port) => {
      if (err) {
        dialog.showErrorBox(i18n.t('OVERLAY_ERR'), i18n.t('NO_PORTS_AVAILABLE'));
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

if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });
}

app.on('ready', () => {
  // Retrieve the userid value, and if it's not there, assign it a new uuid.
  let userId = store.get('userId');

  // Reset the global state
  store.set('GlobalState', null);
  store.set('userPrefs.app.zoomToken', '');

  store.setUserPref('toolbar.language-settings', null);
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
    webPreferences: {
      nodeIntegration: true,
      webviewTag: true,
    },
  });
  mainWindow.webContents.on('dom-ready', () => {
    if (checkForExternalDisplay()) {
      mainWindow.webContents.send('external-display', {
        width: viewerWindowPos.w,
        height: viewerWindowPos.h,
      });
    }
    mainWindow.show();
    // Platform-specific app stores have their own update mechanism
    // so only check if we're not in one
    if (!appstore && !isUnsupportedWindow) {
      checkForUpdates();
    }
    // Show changelog if last version wasn't seen
    const lastSeen = store.get('changelog-seen');

    if (showChangelog()) {
      openSecondaryWindow('changelogWindow');
      if (lastSeen !== appVersion) {
        store.set('changelog-seen-count', 1);
      }
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
      Transliteration: {
        devanagari: '',
        English: '',
      },
      Translation: {
        Spanish: '',
        English: '',
      },
    },
  };

  const emptyLine = {
    Line: {
      Gurmukhi: '',
      English: '',
      Punjabi: '',
      Transliteration: {
        devanagari: '',
        English: '',
      },
      Translation: {
        Spanish: '',
        English: '',
      },
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

ipcMain.on('shortcuts', (event, arg) => {
  mainWindow.webContents.send('shortcuts', arg);
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
  themes,
  appstore,
  i18n,
  isUnsupportedWindow,
};
