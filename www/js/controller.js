/* global Mousetrap */
const electron = require('electron');

const remote = electron.remote;
const app = remote.app;
const Menu = remote.Menu;

const WinMenu = Menu.buildFromTemplate([
  {
    label: 'File',
    submenu: [
      /* {
        label: 'Preferences',
        accelerator: 'Ctrl+,',
        click: () => {
          settings.openSettings();
        },
      },
      {
        type: 'separator',
      }, */
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
          global.platform.ipc.send('checkForUpdates');
        },
      },
      {
        label: 'Changelog...',
        click: () => {
          global.platform.ipc.send('openChangelog');
        },
      },
    ],
  },
]);

// Mousetrap.bindGlobal('mod+,', () => settings.openSettings());
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
    global.platform.ipc.send('show-line', { shabadID, lineID });
  },

  sendText(text) {
    global.platform.ipc.send('show-text', { text });
  },
};
/* global.platform.ipc.on('openSettings', () => {
  settings.openSettings();
}); */
