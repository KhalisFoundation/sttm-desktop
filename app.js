const electron = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const portfinder = require('portfinder');
const i18n = require('i18next');
const i18nBackend = require('i18next-node-fs-backend');
const os = require('os');
const fetch = require('node-fetch');
const remote = require('@electron/remote/main');
// eslint-disable-next-line import/no-unresolved
const aptabase = require('@aptabase/electron/main');
const Sentry = require('@sentry/electron/main');

require('dotenv').config();

remote.initialize();

const expressApp = express();
/* eslint-disable import/order */
const httpBase = require('http').Server(expressApp);
const http = require('http-shutdown')(httpBase);
const io = require('socket.io')(http);
/* eslint-enable */

const prodConfig = require('./config.prod.json');
const defaultPrefs = require('./www/configs/defaults.json');
const themes = require('./www/configs/themes.json');
const Analytics = require('./analytics');
const { styles } = require('./resetViewerStyles');

// Are we packaging for a platform's app store?
const appstore = false;
const maxChangeLogSeenCount = 5;

/* eslint-disable import/no-unresolved, import/extensions */
const Store = require('./www/js/store');
const {
  savedSettingsCamelCase,
} = require('./www/js/common/store/user-settings/get-saved-user-settings');
/* eslint-enable */

const savedSettings = savedSettingsCamelCase();

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
expressApp.use(express.json());

const {
  app,
  webContents,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  globalShortcut,
  systemPreferences,
  shell,
} = electron;

const store = new Store({
  configName: 'user-preferences',
  defaults: defaultPrefs,
});

const appVersion = app.getVersion();

const overlayCast = true;

// Reset to default theme if theme not found
const currentTheme = themes.find((theme) => theme.key === store.getUserPref('app.theme'));
if (currentTheme === undefined) {
  store.setUserPref('app.theme', themes[0].key);
}

let mainWindow;
let viewerWindow = false;
let projectionWindow = false;
/** Embedded controller <webview> (in-app preview) — kept separate from external BrowserWindows */
let embeddedViewerWebContents = null;
let projectionViewport = null;
let projectionRange = null;
/** WebContents of a Display 2 window that has loaded but is not yet projectionWindow. */
let pendingProjectionWebContents = null;
/** @type {{ channel: string, data: any } | null} Last IPC payload for classic Display 1 restore after recreate */
let lastPresenterIpc = null;
/** Pinned external display ids — never reassigned from getAllDisplays() order alone */
let pinnedPresenterDisplayId = null;
let pinnedProjectionDisplayId = null;
let startChangelogOpenTimer;
let endChangelogOpenTimer;

app.setAsDefaultProtocolClient('sttm-desktop');

// Initialize Aptabase with key from appropriate source
let aptabaseKey;
let sentryDsn;
if (process.env.NODE_ENV === 'development') {
  aptabaseKey = process.env.APTABASE_KEY;
  sentryDsn = process.env.SENTRY_DSN;
} else {
  try {
    aptabaseKey = prodConfig.APTABASE_KEY;
    sentryDsn = prodConfig.SENTRY_DSN;
  } catch (error) {
    console.error('Failed to load production config:', error);
  }
}

if (aptabaseKey) {
  aptabase.initialize(aptabaseKey);
}

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
  });
}

if (process.argv.length >= 2) {
  app.setAsDefaultProtocolClient('sttm-desktop', process.execPath, [path.resolve(process.argv[1])]);
}

const secondaryWindows = {
  changelogWindow: {
    obj: false,
    url: `file://${__dirname}/www/changelog.html`,
    onClose: () => {
      const count = store.get('changelog-seen-count');
      endChangelogOpenTimer = new Date().getTime();
      store.set('changelog-seen', appVersion);
      store.set('changelog-seen-count', count + 1);
      global.analytics.trackEvent({
        category: 'changelog',
        action: 'closed',
        label: 'changelog',
        value: (endChangelogOpenTimer - startChangelogOpenTimer) / 1000.0,
      });
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
let lastLine;

function openSecondaryWindow(windowName) {
  const window = secondaryWindows[windowName];
  const openWindow = BrowserWindow.getAllWindows().filter((item) => item.getURL() === window.url);
  if (openWindow.length > 0) {
    openWindow[0].show();
  } else {
    window.obj = new BrowserWindow({
      width: 1366,
      height: 768,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        enableRemoteModule: true,
        contextIsolation: false,
        webviewTag: true,
        nodeIntegrationInSubFrames: true,
        nodeIntegrationInWorker: true,
        media: true,
      },
    });
    remote.enable(window.obj.webContents);
    window.obj.setMenu(null);
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

expressApp.post('/api/bani-control', (req, res) => {
  const data = req.body;

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('bani-controller-data', data);
  }

  res.json({ success: true });
});

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
    dialog
      .showMessageBox({
        type: 'info',
        buttons: [i18n.t('DISMISS'), i18n.t('INSTALL_N_RESTART')],
        defaultId: 1,
        title: i18n.t('UPDATE_AVAILABLE'),
        message: i18n.t('UPDATE_AVAILABLE'),
        detail: i18n.t('UPDATE_DOWNLOADED'),
        cancelId: 0,
      })
      .then(({ response }) => {
        if (response === 1 || response === '1') {
          autoUpdater.quitAndInstall();
        }
        global.analytics.trackEvent({
          category: 'menu',
          action: 'install-restart',
          label: 'from-update-dialog',
          value: response,
        });
      });
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

function saveToken(token) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption is not available on this system');
  }
  const userDataPath = app.getPath('userData');
  const encryptedToken = safeStorage.encryptString(token);
  const tokenPath = path.join(userDataPath, 'userToken.enc');
  fs.writeFileSync(tokenPath, encryptedToken);
}

function retrieveToken() {
  const userDataPath = app.getPath('userData');
  const tokenPath = path.join(userDataPath, 'userToken.enc');

  if (fs.existsSync(tokenPath)) {
    const encryptedToken = fs.readFileSync(tokenPath);
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Decryption is not available on this system');
    }
    return safeStorage.decryptString(encryptedToken);
  }

  return null;
}

function deleteToken() {
  const userDataPath = app.getPath('userData');
  const tokenPath = path.join(userDataPath, 'userToken.enc');
  fs.unlink(tokenPath, () => {
    // eslint-disable-next-line no-console
    console.log('token deleted');
  });
}

let display2Connected = false;

function trackDisplay(action) {
  if (!global.analytics) return;
  global.analytics.trackEvent({
    category: 'display',
    action,
    label: '',
    value: '',
  });
}

function getExternalDisplays() {
  const primaryDisplayId = electron.screen.getPrimaryDisplay().id;
  return electron.screen.getAllDisplays().filter((display) => display.id !== primaryDisplayId);
}

function trackDisplay2Connection() {
  const connected = getExternalDisplays().length >= 2;
  if (connected === display2Connected) return;
  display2Connected = connected;
  trackDisplay(connected ? 'display-2-connected' : 'display-2-disconnected');
}

/** Stable sort so first-time bootstrap is deterministic, not API enumeration order. */
function sortDisplaysStable(displays) {
  return displays.slice().sort((a, b) => {
    if (a.bounds.x !== b.bounds.x) return a.bounds.x - b.bounds.x;
    if (a.bounds.y !== b.bounds.y) return a.bounds.y - b.bounds.y;
    return a.id - b.id;
  });
}

/**
 * Display 1 (classic slide) = one external, pinned by id.
 * Display 2 (teleprompter) = optional second external, pinned by id.
 * Controller stays on OS primary. Never thrash on getAllDisplays() index.
 */
function resolveDisplayRoles() {
  const externals = sortDisplaysStable(getExternalDisplays());
  const byId = new Map(externals.map((display) => [display.id, display]));

  let presenterDisplay = null;
  if (pinnedPresenterDisplayId != null && byId.has(pinnedPresenterDisplayId)) {
    presenterDisplay = byId.get(pinnedPresenterDisplayId);
  } else if (
    viewerWindow &&
    !viewerWindow.isDestroyed() &&
    viewerWindow.displayId != null &&
    byId.has(viewerWindow.displayId)
  ) {
    presenterDisplay = byId.get(viewerWindow.displayId);
    pinnedPresenterDisplayId = presenterDisplay.id;
  } else if (externals.length > 0) {
    [presenterDisplay] = externals;
    pinnedPresenterDisplayId = presenterDisplay.id;
  } else {
    pinnedPresenterDisplayId = null;
  }

  const remaining = externals.filter(
    (display) => !presenterDisplay || display.id !== presenterDisplay.id,
  );
  const remainingById = new Map(remaining.map((display) => [display.id, display]));

  let projectionDisplay = null;
  if (pinnedProjectionDisplayId != null && remainingById.has(pinnedProjectionDisplayId)) {
    projectionDisplay = remainingById.get(pinnedProjectionDisplayId);
  } else if (
    projectionWindow &&
    !projectionWindow.isDestroyed() &&
    projectionWindow.displayId != null &&
    remainingById.has(projectionWindow.displayId)
  ) {
    projectionDisplay = remainingById.get(projectionWindow.displayId);
    pinnedProjectionDisplayId = projectionDisplay.id;
  } else if (remaining.length > 0) {
    [projectionDisplay] = remaining;
    pinnedProjectionDisplayId = projectionDisplay.id;
  } else {
    pinnedProjectionDisplayId = null;
  }

  if (presenterDisplay) {
    pinnedPresenterDisplayId = presenterDisplay.id;
  }
  if (projectionDisplay) {
    pinnedProjectionDisplayId = projectionDisplay.id;
  } else {
    pinnedProjectionDisplayId = null;
  }

  return { presenterDisplay, projectionDisplay };
}

/**
 * Same cover as upstream STTM desktop dev createViewer (D1 golden, no menu):
 * show → setFullScreen(true) → focus controller.
 * setBounds first so dual-external windows land on the correct display.
 */
function presentOnExternalDisplay(browserWindow, display) {
  if (!browserWindow || browserWindow.isDestroyed() || !display) return;
  const { x, y, width, height } = display.bounds;
  try {
    browserWindow.setBounds({ x, y, width, height }, false);
    browserWindow.show();
    browserWindow.setFullScreen(true);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
    }
  } catch (err) {
    log.error(`[display] presentOnExternalDisplay failed: ${err.message}`);
  }
}

/** Display 2 — identical fullscreen path as Display 1. */
function coverProjectionDisplay(browserWindow, display) {
  presentOnExternalDisplay(browserWindow, display);
}

// Pending placement timer per window, so a new move cancels the previous one
const placeDisplayTimers = new WeakMap();

function placeWindowOnDisplay(browserWindow, display) {
  if (!browserWindow || browserWindow.isDestroyed() || !display) return;

  clearTimeout(placeDisplayTimers.get(browserWindow));
  placeDisplayTimers.delete(browserWindow);

  const isProjection = browserWindow === projectionWindow;
  let label = 'window';
  if (browserWindow === viewerWindow) {
    label = 'presenter';
  } else if (isProjection) {
    label = 'projection';
  }
  const { x, y, width, height } = display.bounds;
  const targetId = display.id;
  // eslint-disable-next-line no-param-reassign
  browserWindow.displayId = targetId;

  // Exit any FS mode so bounds can change, then re-apply the right cover.
  try {
    if (
      typeof browserWindow.setSimpleFullScreen === 'function' &&
      browserWindow.isSimpleFullScreen()
    ) {
      browserWindow.setSimpleFullScreen(false);
    }
    if (browserWindow.isFullScreen()) {
      browserWindow.setFullScreen(false);
    }
    browserWindow.setAlwaysOnTop(false);
  } catch (err) {
    log.warn(`[display] ${label} pre-move exit failed: ${err.message}`);
  }

  const placeTimer = setTimeout(() => {
    placeDisplayTimers.delete(browserWindow);
    if (browserWindow.isDestroyed()) return;
    if (isProjection) {
      coverProjectionDisplay(browserWindow, display);
    } else {
      presentOnExternalDisplay(browserWindow, display);
    }
    // eslint-disable-next-line no-param-reassign
    browserWindow.displayId = targetId;
    const bounds = browserWindow.getBounds();
    const onTarget =
      Math.abs(bounds.x - x) < 80 &&
      Math.abs(bounds.y - y) < 80 &&
      Math.abs(bounds.width - width) < 80;
    log.info(
      `[display] ${label} → id=${targetId} target=(${x},${y} ${width}x${height}) ` +
        `actual=(${bounds.x},${bounds.y} ${bounds.width}x${bounds.height}) ok=${onTarget}`,
    );
    if (!onTarget) {
      setTimeout(() => {
        if (browserWindow.isDestroyed()) return;
        if (isProjection) {
          coverProjectionDisplay(browserWindow, display);
        } else {
          presentOnExternalDisplay(browserWindow, display);
        }
        const retry = browserWindow.getBounds();
        log.info(
          `[display] ${label} retry actual=(${retry.x},${retry.y} ${retry.width}x${retry.height})`,
        );
      }, 100);
    }
  }, 50);
  placeDisplayTimers.set(browserWindow, placeTimer);
}

function replayLastPresenterIpc(targetWindow) {
  if (!targetWindow || targetWindow.isDestroyed() || !lastPresenterIpc) return;
  targetWindow.webContents.send(lastPresenterIpc.channel, lastPresenterIpc.data);
}

function sendToViewerWindows(channel, ...args) {
  [viewerWindow, projectionWindow].forEach((window) => {
    if (window && !window.isDestroyed()) window.webContents.send(channel, ...args);
  });
  // Always keep the in-app controller preview in sync (single-monitor / Presentation).
  if (embeddedViewerWebContents && !embeddedViewerWebContents.isDestroyed()) {
    try {
      embeddedViewerWebContents.send(channel, ...args);
    } catch (err) {
      log.warn(`[preview] Failed to send ${channel} to embedded webview: ${err.message}`);
    }
  }
}

function showChangelog() {
  const lastSeen = store.get('changelog-seen');
  const lastSeenCount = store.get('changelog-seen-count');
  const { limitChangeLog } = savedSettings;

  return lastSeen !== appVersion || (lastSeenCount < maxChangeLogSeenCount && !limitChangeLog);
}

function createViewer(ipcData, display) {
  if (viewerWindow && !viewerWindow.isDestroyed()) return;
  const targetDisplay = display || resolveDisplayRoles().presenterDisplay;
  if (!targetDisplay) return;

  if (ipcData && ipcData.send) {
    lastPresenterIpc = { channel: ipcData.send, data: ipcData.data };
  }

  const presenterWindow = new BrowserWindow({
    width: targetDisplay.size.width,
    height: targetDisplay.size.height,
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    autoHideMenuBar: true,
    show: false,
    titleBarStyle: 'hidden',
    frame: false,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: true,
      enableRemoteModule: true,
      contextIsolation: false,
      webviewTag: true,
      nodeIntegrationInSubFrames: true,
      nodeIntegrationInWorker: true,
      media: true,
    },
  });
  viewerWindow = presenterWindow;
  presenterWindow.displayId = targetDisplay.id;
  pinnedPresenterDisplayId = targetDisplay.id;
  // Do NOT assign global.webview here. That ref is reserved for the controller's
  // embedded <webview> (set in ViewerContent). Overwriting it with the external
  // BrowserWindow breaks in-app preview updates (update-viewer-setting).
  presenterWindow.loadURL(`file://${__dirname}/www/viewer.html`);
  remote.enable(presenterWindow.webContents);
  // Upstream dev golden: insertCSS → show → focus → setFullScreen(true) → IPC
  presenterWindow.webContents.on('did-finish-load', () => {
    presenterWindow.webContents.insertCSS(styles);
    presenterWindow.show();
    const [width, height] = presenterWindow.getSize();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('external-display', JSON.stringify({ width, height }));
      mainWindow.focus();
      if (showChangelog() && secondaryWindows.changelogWindow.obj) {
        secondaryWindows.changelogWindow.obj.focus();
      }
    }
    presenterWindow.setFullScreen(true);

    presenterWindow.webContents.send('wc-webview-enabled');
    presenterWindow.webContents.send('update-settings');

    if (ipcData) {
      presenterWindow.webContents.send(ipcData.send, ipcData.data);
    } else {
      replayLastPresenterIpc(presenterWindow);
    }
    // ShabadDeck renders from the store, not from show-line, and a swap starts it
    // empty. Pull the current snapshot so the line + read ticks + home show at
    // once instead of only after the next line change.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('projection-state-request');
    }
  });
  presenterWindow.on('enter-full-screen', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
      if (showChangelog() && secondaryWindows.changelogWindow.obj) {
        secondaryWindows.changelogWindow.obj.focus();
      }
    }
  });
  presenterWindow.on('closed', () => {
    if (viewerWindow === presenterWindow) {
      viewerWindow = false;
      // Keep global.webview — it points at the controller embedded preview, not this window.
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('remove-external-display');
      }
    }
  });
  presenterWindow.on('resize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const [width, height] = presenterWindow.getSize();
      mainWindow.webContents.send('external-display', JSON.stringify({ width, height }));
    }
  });
}

function createProjection(display) {
  if (!display || (projectionWindow && !projectionWindow.isDestroyed())) return;

  const paneWindow = new BrowserWindow({
    width: display.size.width,
    height: display.size.height,
    x: display.bounds.x,
    y: display.bounds.y,
    autoHideMenuBar: true,
    show: false,
    // Match createViewer (Display 1) so native FS covers menu bar the same way.
    titleBarStyle: 'hidden',
    frame: false,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: true,
      enableRemoteModule: true,
      contextIsolation: false,
      webviewTag: true,
      nodeIntegrationInSubFrames: true,
      nodeIntegrationInWorker: true,
      media: true,
    },
  });
  projectionWindow = paneWindow;
  paneWindow.displayId = display.id;
  pinnedProjectionDisplayId = display.id;
  paneWindow.loadURL(`file://${__dirname}/www/viewer.html?paneProjection=1`);
  // Keep a reference: paneWindow.webContents can't be read once the window is destroyed
  const paneWebContents = paneWindow.webContents;
  pendingProjectionWebContents = paneWebContents;
  remote.enable(paneWindow.webContents);
  paneWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    log.error(`[projection] Load failed (${code}): ${description} ${url}`);
  });
  paneWindow.webContents.on('render-process-gone', (_event, details) => {
    log.error(`[projection] Renderer exited: ${details.reason} ${details.exitCode}`);
  });
  paneWindow.webContents.on('did-finish-load', () => {
    // Same golden path as createViewer / upstream D1 (no menu).
    paneWindow.webContents.insertCSS(styles);
    paneWindow.show();
    paneWindow.setFullScreen(true);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
    }
    paneWindow.webContents.send('wc-webview-enabled');
    // Recreate (swap) starts with an empty viewer store. Ask the controller for
    // the current shabad/pane snapshot so Display 2 is not a blank white screen.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('projection-state-request');
    }
  });
  paneWindow.on('enter-full-screen', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
    }
  });
  paneWindow.on('closed', () => {
    if (pendingProjectionWebContents === paneWebContents) {
      pendingProjectionWebContents = null;
    }
    if (projectionWindow === paneWindow) {
      projectionWindow = false;
    }
  });
}

ipcMain.on('viewer-render-start', (event, url) => {
  if (event.sender === projectionWindow?.webContents) {
    log.info(`[projection] Viewer entry loaded: ${url}`);
  }
});

ipcMain.on('viewer-boot-error', (event, message) => {
  if (event.sender === projectionWindow?.webContents) {
    log.error(`[projection] Viewer boot failed: ${message}`);
  }
});

ipcMain.on('viewer-runtime-error', (event, message) => {
  if (event.sender === projectionWindow?.webContents) {
    log.error(`[projection] Viewer runtime failed: ${message}`);
  }
});

ipcMain.on('projection-render-state', (event, state) => {
  if (event.sender === projectionWindow?.webContents) {
    log.info(`[projection] React state: ${JSON.stringify(state)}`);
  }
});

/** Tell controller whether Swap Displays is available (2+ externals). */
function notifyDualDisplayState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('dual-display-state', {
    canSwap: getExternalDisplays().length >= 2,
  });
}

/**
 * Reconcile classic (Display 1) + optional teleprompter (Display 2) windows.
 * Prefer move-in-place over destroy/recreate so Display 1 does not blank.
 * Call on display topology changes — not on every show-line.
 * Swap uses swapDisplayRoles() instead (native FS move is broken on virtuals).
 */
function syncViewerWindows() {
  const { presenterDisplay, projectionDisplay } = resolveDisplayRoles();

  log.info(
    `[display] sync roles presenter=${presenterDisplay ? presenterDisplay.id : 'none'} ` +
      `projection=${projectionDisplay ? projectionDisplay.id : 'none'} ` +
      `viewerWin=${viewerWindow && !viewerWindow.isDestroyed() ? viewerWindow.displayId : 'none'} ` +
      `projWin=${projectionWindow && !projectionWindow.isDestroyed() ? projectionWindow.displayId : 'none'}`,
  );

  const movePresenter =
    presenterDisplay &&
    viewerWindow &&
    !viewerWindow.isDestroyed() &&
    viewerWindow.displayId !== presenterDisplay.id;
  const moveProjection =
    projectionDisplay &&
    projectionWindow &&
    !projectionWindow.isDestroyed() &&
    projectionWindow.displayId !== projectionDisplay.id;

  if (!presenterDisplay) {
    if (viewerWindow && !viewerWindow.isDestroyed()) {
      const previousPresenterWindow = viewerWindow;
      viewerWindow = false;
      previousPresenterWindow.close();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('remove-external-display');
      }
    }
  } else if (movePresenter) {
    placeWindowOnDisplay(viewerWindow, presenterDisplay);
  } else if (!viewerWindow || viewerWindow.isDestroyed()) {
    createViewer(
      lastPresenterIpc
        ? { send: lastPresenterIpc.channel, data: lastPresenterIpc.data }
        : undefined,
      presenterDisplay,
    );
  }

  if (!projectionDisplay) {
    if (projectionWindow && !projectionWindow.isDestroyed()) {
      const previousProjectionWindow = projectionWindow;
      projectionWindow = false;
      previousProjectionWindow.close();
    }
  } else if (moveProjection) {
    const projWin = projectionWindow;
    const projDisplay = projectionDisplay;
    const delayMs = movePresenter ? 100 : 0;
    setTimeout(() => {
      if (!projWin || projWin.isDestroyed()) return;
      placeWindowOnDisplay(projWin, projDisplay);
    }, delayMs);
  } else if (!projectionWindow || projectionWindow.isDestroyed()) {
    createProjection(projectionDisplay);
  }

  notifyDualDisplayState();
  trackDisplay2Connection();
}

/**
 * Swap = flip pins, create NEW windows (same path as initial load), then close old.
 * Do NOT: close-then-create (menu bar), or in-place loadURL (blank first swap).
 */
function swapDisplayRoles() {
  const externals = sortDisplaysStable(getExternalDisplays());
  if (externals.length < 2) {
    log.warn(
      `[display] swap ignored — need 2+ externals, got ${externals.length} ` +
        `(ids=${externals.map((d) => d.id).join(',')})`,
    );
    notifyDualDisplayState();
    return;
  }

  const previousPresenterId = pinnedPresenterDisplayId;
  const previousProjectionId = pinnedProjectionDisplayId;

  if (
    previousPresenterId != null &&
    previousProjectionId != null &&
    previousPresenterId !== previousProjectionId
  ) {
    pinnedPresenterDisplayId = previousProjectionId;
    pinnedProjectionDisplayId = previousPresenterId;
  } else {
    pinnedPresenterDisplayId = externals[1].id;
    pinnedProjectionDisplayId = externals[0].id;
  }

  log.info(
    `[display] swap pins ${previousPresenterId}/${previousProjectionId} → ` +
      `${pinnedPresenterDisplayId}/${pinnedProjectionDisplayId}; ` +
      `externals=${externals.map((d) => `${d.id}@(${d.bounds.x},${d.bounds.y})`).join(' ')}`,
  );

  const { presenterDisplay, projectionDisplay } = resolveDisplayRoles();
  const presenterIpc = lastPresenterIpc
    ? { send: lastPresenterIpc.channel, data: lastPresenterIpc.data }
    : undefined;

  const oldViewer = viewerWindow && !viewerWindow.isDestroyed() ? viewerWindow : null;
  const oldProjection =
    projectionWindow && !projectionWindow.isDestroyed() ? projectionWindow : null;

  // Detach globals so create* can run; keep old windows alive until new ones are up.
  viewerWindow = false;
  projectionWindow = false;
  if (oldViewer) {
    oldViewer.removeAllListeners('closed');
  }
  if (oldProjection) {
    oldProjection.removeAllListeners('closed');
  }

  if (presenterDisplay) {
    createViewer(presenterIpc, presenterDisplay);
  }
  if (projectionDisplay) {
    createProjection(projectionDisplay);
  }
  const createdViewer = viewerWindow;
  const createdProjection = projectionWindow;

  const closeOld = (win) => {
    if (!win || win.isDestroyed()) return;
    try {
      win.close();
    } catch (err) {
      /* ignore */
    }
  };

  // After old FS windows leave the displays, re-assert cover so macOS menu bar stays hidden.
  const recoverFullscreenAfterSwap = () => {
    setTimeout(() => {
      if (viewerWindow && !viewerWindow.isDestroyed() && presenterDisplay) {
        presentOnExternalDisplay(viewerWindow, presenterDisplay);
      }
      if (projectionWindow && !projectionWindow.isDestroyed() && projectionDisplay) {
        coverProjectionDisplay(projectionWindow, projectionDisplay);
      }
    }, 50);
  };

  // Close previous pair after new windows finish their first load (FS already applied).
  let pending = (presenterDisplay ? 1 : 0) + (projectionDisplay ? 1 : 0);
  let settled = false;
  let safetyTimer = null;
  const finishSwap = () => {
    if (settled) return;
    settled = true;
    clearTimeout(safetyTimer);
    closeOld(oldViewer);
    closeOld(oldProjection);
    recoverFullscreenAfterSwap();
  };
  const onNewReady = () => {
    pending -= 1;
    if (pending > 0) return;
    finishSwap();
  };

  if (viewerWindow && !viewerWindow.isDestroyed()) {
    viewerWindow.webContents.once('did-finish-load', onNewReady);
  }
  if (projectionWindow && !projectionWindow.isDestroyed()) {
    projectionWindow.webContents.once('did-finish-load', onNewReady);
  }
  if (pending === 0) {
    finishSwap();
  }

  // Safety: if load hangs, still tear down old windows and recover FS.
  // Skip once both windows have loaded, or if a newer swap already replaced them.
  safetyTimer = setTimeout(() => {
    if (
      (presenterDisplay && viewerWindow !== createdViewer) ||
      (projectionDisplay && projectionWindow !== createdProjection)
    ) {
      return;
    }
    finishSwap();
  }, 4000);

  notifyDualDisplayState();
}

ipcMain.on('projection-state-request', (event) => {
  const fromCurrentProjection =
    projectionWindow &&
    !projectionWindow.isDestroyed() &&
    event.sender === projectionWindow.webContents;
  const fromPendingProjection = event.sender === pendingProjectionWebContents;
  if (
    (!fromCurrentProjection && !fromPendingProjection) ||
    !mainWindow ||
    mainWindow.isDestroyed()
  ) {
    log.warn('[projection] Ignored state request from an unexpected renderer');
    return;
  }
  log.info('[projection] State request received from display renderer');
  mainWindow.webContents.send('projection-state-request');
});

ipcMain.on('projection-state-response', (event, state) => {
  if (event.sender !== mainWindow?.webContents) {
    log.warn('[projection] Ignored state response from an unexpected renderer');
    return;
  }
  const target = projectionWindow && !projectionWindow.isDestroyed() ? projectionWindow : null;
  const hasProjectionTarget =
    target || (pendingProjectionWebContents && !pendingProjectionWebContents.isDestroyed());
  const hasViewerTarget = viewerWindow && !viewerWindow.isDestroyed();
  if (!hasProjectionTarget && !hasViewerTarget) {
    log.warn('[projection] Ignored state response; no display window');
    return;
  }
  const payload = {
    ...state,
    viewport: projectionViewport,
    range: projectionRange,
  };
  log.info(`[projection] State response received; viewport=${Boolean(projectionViewport?.width)}`);
  // Display 2 (pane projection) needs the scaled viewport; Display 1 (ShabadDeck)
  // hydrates its store from the same snapshot so a swap isn't blank.
  if (target) {
    target.webContents.send('projection-state', payload);
  } else if (pendingProjectionWebContents && !pendingProjectionWebContents.isDestroyed()) {
    pendingProjectionWebContents.send('projection-state', payload);
  }
  if (hasViewerTarget) {
    viewerWindow.webContents.send('projection-state', payload);
  }
});

ipcMain.on('projection-viewport', (event, viewport) => {
  if (event.sender !== mainWindow?.webContents) return;
  projectionViewport = viewport;
  log.info(`[projection] Source pane viewport ${viewport.width}x${viewport.height}`);
  if (projectionWindow && !projectionWindow.isDestroyed()) {
    projectionWindow.webContents.send('projection-viewport', viewport);
  }
});

ipcMain.on('projection-range', (event, range) => {
  if (event.sender !== mainWindow?.webContents) return;
  projectionRange = range;
  if (projectionWindow && !projectionWindow.isDestroyed()) {
    projectionWindow.webContents.send('projection-range', range);
  }
});

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
    if (arg.Line.Gurmukhi) {
      fs.writeFile(gurbaniFile, arg.Line.Gurmukhi.trim(), writeFileCallback);
      fs.appendFile(gurbaniFile, '\n', writeFileCallback);
      fs.writeFile(englishFile, arg.Line.English.trim(), writeFileCallback);
      fs.appendFile(englishFile, '\n', writeFileCallback);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(err);
  }
}

let seq = Math.floor(Math.random() * 100);

const showLine = async (line, socket = io) => {
  const lineWithSettings = line;
  lineWithSettings.languageSettings = {
    translation: savedSettings.translationLanguage,
    transliteration: savedSettings.transliterationLanguage,
  };

  const payload = lineWithSettings;
  if (Object.keys(line).length) {
    socket.emit('show-line', payload);
  }
  const zoomToken = store.get('userPrefs.app.zoomToken');
  if (zoomToken && line.Line && line.Line.Unicode) {
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

const updateOverlayVars = (overlayPrefs) => {
  if (overlayPrefs) {
    io.emit('update-prefs', overlayPrefs);
  } else {
    mainWindow.webContents.send('get-overlay-prefs');
  }
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
  if (savedSettings.liveFeed) {
    createBroadcastFiles(emptyLine);
  }
};

const singleInstanceLock = app.requestSingleInstanceLock();

const searchPorts = () => {
  portfinder.getPort(
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

const handleDeeplink = async (url) => {
  const urlObject = url.replace('sttm-desktop://', '').split('?');
  if (urlObject[0].includes('login')) {
    const loginData = new URLSearchParams(`?${urlObject[1]}`);
    const token = loginData.get('token');
    if (token) {
      try {
        saveToken(token);
        mainWindow.webContents.send('userToken', token);
      } catch {
        // eslint-disable-next-line no-console
        console.error('Error saving token');
      }
    }
  }
};

if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
    const deepLinkUrl = commandLine.find((arg) => arg.startsWith('sttm-desktop://'));
    if (deepLinkUrl) {
      handleDeeplink(deepLinkUrl);
    }
  });
}

app.on('open-url', (event, url) => {
  handleDeeplink(url);
});

app.on('ready', () => {
  // Retrieve the userid value, and if it's not there, assign it a new uuid.
  let userId = store.get('userId');

  // Reset the global state
  store.set('GlobalState', null);
  store.set('userPrefs.app.zoomToken', '');

  store.setUserPref('toolbar.language-settings', null);
  if (!userId) {
    userId = uuidv4();
    store.set('userId', userId);
  }
  const analytics = new Analytics();
  global.analytics = analytics;

  const screens = electron.screen;
  const { width, height } = screens.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    minWidth: 800,
    minHeight: 600,
    width,
    height,
    frame: process.platform === 'linux', // show frame only on linux
    show: false,
    backgroundColor: '#000000',
    titleBarStyle: 'hidden',
    // Keep controller in Cmd+Tab / Dock (must not be a UIElement/accessory app).
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: true,
      enableRemoteModule: true,
      contextIsolation: false,
      webviewTag: true,
      nodeIntegrationInSubFrames: true,
      nodeIntegrationInWorker: true,
      media: true,
    },
  });
  // Dev + multi-display cover can leave the process as LSUIElement (no Cmd+Tab).
  // Force normal app activation so controller shows in app switcher / Dock.
  if (process.platform === 'darwin' && typeof app.setActivationPolicy === 'function') {
    try {
      app.setActivationPolicy('regular');
    } catch (err) {
      log.warn(`[app] setActivationPolicy failed: ${err.message}`);
    }
  }
  if (process.platform === 'darwin' && app.dock && typeof app.dock.show === 'function') {
    try {
      app.dock.show();
    } catch (err) {
      log.warn(`[app] dock.show failed: ${err.message}`);
    }
  }
  const splash = new BrowserWindow({
    width: 600,
    height: 400,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
  });
  splash.loadURL(`file://${__dirname}/www/splash.html`);
  splash.center();
  remote.enable(mainWindow.webContents);

  // Set up session permission handler for microphone access (required for Windows)
  const { session } = electron;
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      // Allow microphone access
      callback(true);
    } else {
      // Deny other permissions by default
      callback(false);
    }
  });

  mainWindow.webContents.on('dom-ready', () => {
    const { presenterDisplay } = resolveDisplayRoles();
    if (presenterDisplay) {
      mainWindow.webContents.send(
        'external-display',
        JSON.stringify({
          width: presenterDisplay.size.width,
          height: presenterDisplay.size.height,
        }),
      );
    }
    splash.close();
    mainWindow.show();
    if (process.platform === 'darwin' && typeof app.setActivationPolicy === 'function') {
      try {
        app.setActivationPolicy('regular');
      } catch (err) {
        // ignore
      }
    }
    if (process.platform === 'darwin' && app.dock && typeof app.dock.show === 'function') {
      try {
        app.dock.show();
      } catch (err) {
        // ignore
      }
    }
    mainWindow.focus();
    const token = retrieveToken();
    if (token) {
      mainWindow.webContents.send('userToken', token);
    }
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
    syncViewerWindows();
  });
  mainWindow.loadURL(`file://${__dirname}/www/index.html`);

  if (!store.get('user-agent')) {
    store.set('user-agent', mainWindow.webContents.getUserAgent());
  }

  // Close all other windows if closing the main
  mainWindow.on('close', () => {
    if (display2Connected) {
      trackDisplay('display-2-disconnected');
      display2Connected = false;
    }
    emptyOverlay();
    if (viewerWindow && !viewerWindow.isDestroyed()) viewerWindow.close();
    if (projectionWindow && !projectionWindow.isDestroyed()) projectionWindow.close();
    viewerWindow = false;
    projectionWindow = false;
    embeddedViewerWebContents = null;
    global.webview = null;
    const changelogWindow = secondaryWindows.changelogWindow.obj;
    if (changelogWindow && !changelogWindow.isDestroyed()) {
      changelogWindow.close();
    }
  });

  screens.on('display-added', () => syncViewerWindows());
  screens.on('display-removed', () => syncViewerWindows());
  screens.on('display-metrics-changed', () => syncViewerWindows());

  globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (mainWindow) {
      mainWindow.webContents.openDevTools();
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

ipcMain.handle('send-to-bani-controller', async (event, data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('bani-controller-data', data);
  }
  return { success: true };
});

ipcMain.on('enable-wc-webview', (event, data) => {
  const webViewWC = webContents.fromId(parseInt(data, 10));
  if (!webViewWC || webViewWC.isDestroyed()) {
    log.warn('[preview] enable-wc-webview: invalid webContents id');
    return;
  }
  // Track controller embedded preview separately from external Display 1/2 windows.
  embeddedViewerWebContents = webViewWC;
  remote.enable(webViewWC);
  webViewWC.send('wc-webview-enabled');
  sendToViewerWindows('wc-webview-enabled');
});

ipcMain.on('cast-session-active', () => {
  mainWindow.webContents.send('cast-session-active');
});

ipcMain.on('cast-session-stopped', () => {
  mainWindow.webContents.send('cast-session-stopped');
});

ipcMain.on('cast-to-receiver', (event) => {
  event.reply('cast-verse', 'update verse');
});

ipcMain.on('checkForUpdates', checkForUpdates);
ipcMain.on('quitAndInstall', () => autoUpdater.quitAndInstall());

ipcMain.on('clear-apv', () => {
  sendToViewerWindows('clear-apv');
});

ipcMain.on('save-overlay-settings', (event, overlayPrefs) => {
  updateOverlayVars(JSON.parse(overlayPrefs));
});

ipcMain.on('deleteToken', () => {
  deleteToken();
});

io.on('connection', (socket) => {
  updateOverlayVars();
  if (lastLine) {
    showLine(lastLine, socket);
  }
});

ipcMain.on('show-line', (event, arg) => {
  const linePayload = JSON.parse(arg);
  // paneSync messages are for Display 2 (pane projection) only — they carry no
  // Line. They must not become the "last presenter line" (replayed to Display 1
  // on swap/recreate) or feed/create the overlay, or the line display comes up
  // blank after a swap until the next real line is picked.
  const isPaneSync = linePayload && linePayload.paneSync === true;
  if (!isPaneSync) {
    lastLine = linePayload;
    lastPresenterIpc = { channel: 'show-line', data: linePayload };
    showLine(linePayload);
  }
  if (viewerWindow && !viewerWindow.isDestroyed()) {
    if (!isPaneSync) {
      viewerWindow.webContents.send('show-line', linePayload);
    }
  } else if (!isPaneSync) {
    createViewer({ send: 'show-line', data: linePayload });
  }
  if (projectionWindow && !projectionWindow.isDestroyed()) {
    projectionWindow.webContents.send('show-line', linePayload);
  }
  // In-app preview (single monitor): must receive show-line even when no external
  // Display 1. It mirrors the overlay, so it skips Display-2-only paneSync.
  if (!isPaneSync && embeddedViewerWebContents && !embeddedViewerWebContents.isDestroyed()) {
    try {
      embeddedViewerWebContents.send('show-line', linePayload);
    } catch (err) {
      log.warn(`[preview] show-line to embedded webview failed: ${err.message}`);
    }
  }
  // Do not call syncViewerWindows() here — display order thrash was blanking Display 1.
  if (linePayload.live) {
    createBroadcastFiles(linePayload);
  }
});

ipcMain.on('show-misc-text', (event, arg) => {
  io.emit('show-misc-text', arg);
});

ipcMain.on('show-empty-slide', () => {
  emptyOverlay();
});

ipcMain.on('show-text', (event, arg) => {
  const { isGurmukhi, text, unicode } = JSON.parse(arg);
  const textLine = {
    Line: {
      Gurmukhi: isGurmukhi ? text : '',
      English: !isGurmukhi ? text : '',
      Unicode: unicode,
      Punjabi: '',
      Transliteration: {
        devanagari: '',
        English: '',
      },
      Translation: {
        Spanish: '',
        English: '',
        Hindi: '',
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
        Hindi: '',
      },
    },
  };

  const announcementOverlay = store.getUserPref('app.announcement-overlay');
  if (arg.isAnnouncement && !announcementOverlay) {
    showLine(emptyLine);
  } else {
    showLine(textLine);
  }

  if (viewerWindow && !viewerWindow.isDestroyed()) {
    viewerWindow.webContents.send('show-text', arg);
  } else {
    createViewer({ send: 'show-text', data: arg });
  }
  lastPresenterIpc = { channel: 'show-text', data: arg };
  if (arg.live) {
    createBroadcastFiles(arg);
  }
});

ipcMain.on('toggle-viewer-window', (event, arg) => {
  if (viewerWindow && !viewerWindow.isDestroyed()) {
    if (arg) {
      const d =
        electron.screen.getAllDisplays().find((disp) => disp.id === viewerWindow.displayId) ||
        resolveDisplayRoles().presenterDisplay;
      if (d) presentOnExternalDisplay(viewerWindow, d);
      else viewerWindow.show();
    } else {
      viewerWindow.hide();
    }
  }
  if (projectionWindow && !projectionWindow.isDestroyed()) {
    if (arg) {
      const d =
        electron.screen.getAllDisplays().find((disp) => disp.id === projectionWindow.displayId) ||
        resolveDisplayRoles().projectionDisplay;
      if (d) coverProjectionDisplay(projectionWindow, d);
      else projectionWindow.show();
    } else {
      projectionWindow.hide();
    }
  }
});

ipcMain.on('swap-display-roles', () => {
  trackDisplay('swap-display-used');
  swapDisplayRoles();
});

ipcMain.on('dual-display-state-request', () => {
  notifyDualDisplayState();
});

ipcMain.on('presenter-view', (event, arg) => {
  if (viewerWindow && !viewerWindow.isDestroyed()) {
    if (!arg) {
      viewerWindow.hide();
    } else {
      const d =
        electron.screen.getAllDisplays().find((disp) => disp.id === viewerWindow.displayId) ||
        resolveDisplayRoles().presenterDisplay;
      if (d) presentOnExternalDisplay(viewerWindow, d);
      else viewerWindow.show();
    }
  }
  if (projectionWindow && !projectionWindow.isDestroyed()) {
    if (!arg) {
      projectionWindow.hide();
    } else {
      const d =
        electron.screen.getAllDisplays().find((disp) => disp.id === projectionWindow.displayId) ||
        resolveDisplayRoles().projectionDisplay;
      if (d) coverProjectionDisplay(projectionWindow, d);
      else projectionWindow.show();
    }
  }
});

ipcMain.on('scroll-from-main', (event, arg) => {
  sendToViewerWindows('send-scroll', arg);
});

ipcMain.on('next-ang', (event, arg) => {
  sendToViewerWindows('show-ang', arg);
  mainWindow.webContents.send('next-ang', arg);
});

ipcMain.on('scroll-pos', (event, arg) => {
  mainWindow.webContents.send('send-scroll', arg);
});

ipcMain.on('update-settings', () => {
  sendToViewerWindows('update-settings');
  mainWindow.webContents.send('sync-settings');
});

// A new AI translations database was downloaded; every window reopens it
ipcMain.on('ai-translations-updated', () => {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('ai-translations-updated');
  });
});

ipcMain.on('save-settings', (event, setting) => {
  sendToViewerWindows('save-settings', setting);
});

ipcMain.on('update-viewer-setting', (event, setting) => {
  sendToViewerWindows('update-viewer-setting', setting);
});

ipcMain.on('update-global-setting', (event, setting) => {
  mainWindow.webContents.send('update-global-setting', setting);
});

ipcMain.on('set-user-setting', (event, settingChanger) => {
  mainWindow.webContents.send('set-user-setting', settingChanger);
});

ipcMain.on('get-media-access-status', async (event, mediaType) => {
  try {
    // macOS-specific API
    if (platform === 'darwin' && systemPreferences.askForMediaAccess) {
      const isGranted = await systemPreferences.askForMediaAccess(mediaType);
      if (!isGranted) {
        if (mediaType === 'microphone') {
          shell.openExternal(
            'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
          );
        }
      }
      event.reply('media-access-status', isGranted ? 'granted' : 'denied');
    } else {
      event.reply('media-access-status', 'granted');
    }
  } catch (error) {
    console.error('Error checking media access status:', error);
    event.reply('media-access-status', 'granted');
  }
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
