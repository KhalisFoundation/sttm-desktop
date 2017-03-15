'use strict';

const electron  = require('electron');
const remote    = electron.remote;
const app       = remote.app;
const Menu      = remote.Menu;

const WinMenu = Menu.buildFromTemplate([
  {
    label: "File",
    submenu: [
      {
        label: "Check for Updates...",
        accelerator: "Ctrl+U",
        click: () => {
          platform.ipc.send("checkForUpdates");
        }
      },
      {
        label: "Preferences",
        accelerator: "Ctrl+,",
        click: () => {
          settings.openSettings();
        }
      },
      {
        type: "separator"
      },
      {
        label: "Quit",
        accelerator: "Ctrl+Q",
        click: () => {
          app.quit();
        }
      }
    ]
  },
]);

Mousetrap.bindGlobal('mod+,', () => settings.openSettings());
Mousetrap.bindGlobal('mod+q', () => {
  app.quit();
})

const $menuButton = document.querySelector(".menu-button");
$menuButton.addEventListener('contextmenu', e => {
    e.preventDefault();
    e.stopPropagation();
    WinMenu.popup(remote.getCurrentWindow());
});
$menuButton.addEventListener("click", e => {
  e = $menuButton.ownerDocument.createEvent('MouseEvents');
  e.initMouseEvent('contextmenu', true, true,
     $menuButton.ownerDocument.defaultView, 1, 0, 0, 0, 0, false,
     false, false, false,2, null);
  return !$menuButton.dispatchEvent(e);
});
module.exports = {
  sendLine: function(shabadID, lineID) {
    platform.ipc.send("show-line", {shabadID: shabadID, lineID: lineID});
  },

  sendText: function(text) {
    platform.ipc.send("show-text", {text: text});
  }
}
platform.ipc.on("checkingForUpdates", () => {
  document.body.classList.add("checkingForUpdates");
});
platform.ipc.on("no-update", () => {
  document.body.classList.remove("checkingForUpdates");
  document.body.classList.add("no-update");
  setTimeout(() => {
    document.body.classList.remove("no-update");
  }, 5000);
});
platform.ipc.on("updating", function(event, data) {
  document.body.classList.remove("checkingForUpdates");
  document.body.classList.add("updating");
});
platform.ipc.on("updateReady", () => {
  document.body.classList.remove("checkingForUpdates updating no-update offline");
  document.body.classList.add("updateReady");
});
platform.ipc.on("offline", () => {
  document.body.classList.remove("checkingForUpdates");
  document.body.classList.add("offline");
  setTimeout(() => {
    document.body.classList.remove("offline");
  }, 5000);
});
platform.ipc.on("openSettings", () => {
  settings.openSettings();
});
