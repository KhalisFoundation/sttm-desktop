/* global Mousetrap platform settings */
/* eslint import/no-extraneous-dependencies: 0, import/no-unresolved: 0 */
const electron = require('electron');

const remote = electron.remote;
const app = remote.app;
const Menu = remote.Menu;

const WinMenu = Menu.buildFromTemplate([
  {
    label: 'File',
    submenu: [
      {
        label: 'Preferences',
        accelerator: 'Ctrl+,',
        click: () => {
          settings.openSettings();
        },
      },
      {
        type: 'separator',
      },
      {
        label: 'Quit',
        accelerator: 'Ctrl+Q',
        click: () => {
          app.quit();
        },
      },
    ],
  },
  {
    label: 'Help',
    submenu: [
      {
        label: 'Check for Updates...',
        accelerator: 'Ctrl+U',
        click: () => {
          platform.ipc.send('checkForUpdates');
        },
      },
      {
        label: 'Changelog...',
        click: () => {
          platform.ipc.send('openChangelog');
        },
      },
    ],
  },
]);

Mousetrap.bindGlobal('mod+,', () => settings.openSettings());
Mousetrap.bindGlobal('mod+q', () => {
  app.quit();
});

const $menuButton = document.querySelector('.menu-button');
$menuButton.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  e.stopPropagation();
  WinMenu.popup(remote.getCurrentWindow());
});
$menuButton.addEventListener('click', () => {
  const e = $menuButton.ownerDocument.createEvent('MouseEvents');
  e.initMouseEvent('contextmenu', true, true,
    $menuButton.ownerDocument.defaultView, 1, 0, 0, 0, 0, false,
    false, false, false, 2, null);
  return !$menuButton.dispatchEvent(e);
});
module.exports = {
  sendLine(shabadID, lineID) {
    platform.ipc.send('show-line', { shabadID, lineID });
  },

  sendText(text) {
    platform.ipc.send('show-text', { text });
  },
};
platform.ipc.on('checking-for-update', () => {
  document.body.classList.add('checking-for-update');
});
platform.ipc.on('no-update', () => {
  document.body.classList.remove('checking-for-update');
  document.body.classList.add('no-update');
  setTimeout(() => {
    document.body.classList.remove('no-update');
  }, 5000);
});
platform.ipc.on('updating', () => {
  document.body.classList.remove('checking-for-update');
  document.body.classList.add('updating');
});
platform.ipc.on('updateReady', () => {
  document.body.classList.remove('checking-for-update', 'updating', 'no-update', 'update-error');
  document.body.classList.add('update-ready');
});
platform.ipc.on('update-error', () => {
  document.body.classList.remove('checking-for-update');
  document.body.classList.add('update-error');
  setTimeout(() => {
    document.body.classList.remove('update-error', 'checking-for-update');
  }, 5000);
});
platform.ipc.on('openSettings', () => {
  settings.openSettings();
});
