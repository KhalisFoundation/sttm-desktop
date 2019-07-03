import { app, BrowserWindow, screen as screens } from 'electron';
/* eslint-disable no-unused-vars */
import os from 'os';
import path from 'path';
// Store
import store from './store';
// eslint-enable

// Global variables
let mainWindow;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
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

  app.on('ready', () => {
    // Uncomment on first-run to install React and Redux DevTool extensions
    /* BrowserWindow.addDevToolsExtension(
      path.join(
        os.homedir(),
        'Library/Application Support/Google/Chrome/Default/Extensions/fmkadmapgofadopljbjfkapdkoienihi/3.6.0_0',
      ),
    );
    BrowserWindow.addDevToolsExtension(
      path.join(
        os.homedir(),
        'Library/Application Support/Google/Chrome/Default/Extensions/lmhkpmbekcpmknklioeibfkpmmfibljd/2.17.0_0',
      ),
    ); */

    const { width, height } = screens.getPrimaryDisplay().workAreaSize;
    mainWindow = new BrowserWindow({
      minWidth: 800,
      minHeight: 600,
      width,
      height,
      frame: process.platform !== 'win32',
      show: false,
      titleBarStyle: 'hidden',
      webPreferences: {
        nodeIntegration: true,
        webviewTag: true,
      },
    });
    // Only show main window when its contents are loaded
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.show();
    });
    mainWindow.loadURL(`file://${__dirname}/../index.html`);
  });

  // Quit when all windows are closed.
  app.on('window-all-closed', () => {
    app.quit();
  });
}
