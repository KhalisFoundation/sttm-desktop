const electron = require('electron');
const fs = require('fs');
const isOnline = require('is-online');
const path = require('path');
const request = require('request');
const progress = require('request-progress');

const { remote } = electron;
const ipc = electron.ipcRenderer;
const userDataPath = remote.app.getPath('userData');
const dbPath = path.resolve(userDataPath, 'sttmdesktop.realm');

const { store } = remote.require('./app');

const POLLING_INTERVAL = (120 * 60000); // poll for new notifications every 2hrs.

function windowAction(e) {
  const win = remote.getCurrentWindow();
  const el = e.currentTarget;
  switch (el.dataset.windowAction) {
    case 'minimize':
      win.minimize();
      break;
    case 'max-restore':
      if (win.isMaximized()) {
        win.unmaximize();
        document.body.classList.remove('maximized');
      } else {
        win.maximize();
        document.body.classList.add('maximized');
      }
      break;
    case 'close':
      win.close();
      break;
    default:
      break;
  }
}

function addBadgeToNotification(msg) {
  if (msg && msg.length > 0) {
    document.getElementById('notifications-icon').classList.add('badge');
  }
}

function checkForNotifcations() {
  let timeStamp = store.get('userPrefs.notification-timestamp');
  global.core.menu.getNotifications(timeStamp, global.core.menu.showNotificationsModal);

  setInterval(() => {
    timeStamp = store.get('userPrefs.notification-timestamp');
    global.core.menu.getNotifications(timeStamp, addBadgeToNotification);
  }, POLLING_INTERVAL);
}

module.exports = {
  ipc,
  store,

  init() {
    // Initialize DB right away if it exists
    if (fs.existsSync(dbPath)) {
      this.initDB();
      // Check if there's a newer version
      this.downloadLatestDB();
    } else {
      // Download the DB
      this.downloadLatestDB(true);
    }
    checkForNotifcations();
  },

  downloadLatestDB(force = false) {
    if (force) {
      global.core.search.$search.placeholder = 'Downloading database...';
    }
    isOnline().then((online) => {
      if (online) {
        request('https://banidb.com/databases/sttmdesktop.realm.md5', (error, response, newestDBHash) => {
          if (!error && response.statusCode === 200) {
            const curDBHash = store.get('curDBHash');
            if (force || curDBHash !== newestDBHash) {
              const dbCompressed = path.resolve(userDataPath, 'sttmdesktop.realm.bz2');
              progress(request('https://banidb.com/databases/sttmdesktop.realm.bz2'))
                .on('progress', (state) => {
                  const win = remote.getCurrentWindow();
                  win.setProgressBar(state.percent);
                  global.core.search.updateDLProgress(state);
                })
                .on('end', () => ipc.send('decompress', { dbCompressed, userDataPath, dbPath, newestDBHash }))
                .pipe(fs.createWriteStream(dbCompressed));
            }
          }
        });
      } else if (force) {
        global.core.search.offline(10);
      }
    });
  },

  initDB() {
    if (global.core) {
      global.core.search.initSearch();
    }
  },

  updateSettings() {
    if (global.webview) global.webview.send('update-settings');
    if (global.platform) global.platform.ipc.send('update-settings');
  },

  updateNotificationsTimestamp(time) {
    store.setUserPref('notification-timestamp', time);
  },
};

const $titleButtons = document.querySelectorAll('#titlebar .controls a');
Array.from($titleButtons).forEach((el) => {
  el.addEventListener('click', e => windowAction(e));
});

const allTabs = document.getElementsByClassName('nav-header-tab');
const moreTabs = document.querySelector('.more-tabs');
const sessionPage = document.querySelector('#session-page .block-list');

function showTabContent(clickedTab) {
  document.querySelector('.nav-header-tab.active').classList.remove('active');
  const tabContent = document.getElementById(`${clickedTab}-content`);
  document.querySelector('.tab-content.active').classList.remove('active');
  tabContent.classList.add('active');
}

Array.prototype.forEach.call(allTabs, ((element) => {
  element.addEventListener('click', (event) => {
    const clickedTab = event.currentTarget;
    const clickedTabId = event.currentTarget.id;
    const tabParent = event.currentTarget.parentElement;
    if (tabParent.classList.contains('more-tabs')) {
      moreTabs.insertBefore(clickedTab, moreTabs.firstChild);
    } else {
      moreTabs.classList.remove('listview');
    }
    showTabContent(clickedTabId);
    document.getElementById(clickedTabId).classList.add('active');
  });
}));

if (moreTabs) {
  moreTabs.addEventListener('click', () => {
    moreTabs.classList.toggle('listview');
  });
}

if (sessionPage) {
  sessionPage.addEventListener('click', () => {
    moreTabs.classList.remove('listview');
  });
}

const $minimize = document.querySelectorAll('.navigator-header .toggle-minimize');
const $minimizeIcons = document.querySelectorAll('.navigator-header .toggle-minimize i');

if ($minimize) {
  Array.prototype.forEach.call($minimize, ((minimize) => {
    minimize.addEventListener('click', () => {
      Array.prototype.forEach.call($minimizeIcons, ((element) => {
        element.classList.toggle('disabled');
      }));
      document.getElementById('navigator').classList.toggle('minimized');
    });
  }));
}
