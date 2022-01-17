const { ipcRenderer } = require('electron');
const electron = require('electron');
const extract = require('extract-zip');
const fs = require('fs');
const isOnline = require('is-online');
const path = require('path');
const request = require('request');
const progress = require('request-progress');
const tingle = require('../assets/js/vendor/tingle');

const { remote } = electron;
const { i18n, isUnsupportedWindow } = remote.require('./app');
const ipc = electron.ipcRenderer;
const userDataPath = remote.app.getPath('userData');
const database = {
  realm: {
    dbCompressedName: 'sttmdesktop-evergreen.zip',
    dbName: 'sttmdesktop-evergreen.realm',
    dbSchema: 'realm-schema-evergreen.json',
    md5: 'sttmdesktop-evergreen.md5',
  },
};

const dbPlatform = 'realm';
const dbSchemaPath = schemaPath =>
  !database[dbPlatform].dbSchema || path.resolve(schemaPath, database[dbPlatform].dbSchema);

const dbPath = path.resolve(userDataPath, database[dbPlatform].dbName);
const dbSchema = dbSchemaPath(userDataPath);
const newDBFolder = path.resolve(userDataPath, 'new-db');
const newDBPath = path.resolve(newDBFolder, database[dbPlatform].dbName);
const newDBSchema = dbSchemaPath(newDBFolder);

const { store } = remote.require('./app');

const POLLING_INTERVAL = 120 * 60000; // poll for new notifications every 2hrs.

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
    if (
      fs.existsSync(dbPath) &&
      fs.statSync(dbPath).size > 0 &&
      (dbPlatform !== 'realm' || fs.existsSync(dbSchema))
    ) {
      this.initDB();
      // Check if there's a newer version
      this.downloadLatestDB();
    } else {
      // Download the DB
      this.downloadLatestDB(true);
    }
    checkForNotifcations();

    if (isUnsupportedWindow) {
      const modal = new tingle.Modal({
        stickyFooter: false,
        closeMethods: ['overlay', 'button', 'escape'],
      });

      modal.setContent(`<h1 class="model-title">${i18n.t('UNSUPPORT_OS')}</h1>`);
      modal.open();
    }
  },

  downloadLatestDB(force = false) {
    if (force) {
      localStorage.setItem('isDbDownloaded', false);
    } else {
      localStorage.setItem('isDbDownloaded', true);
    }
    isOnline().then(online => {
      if (online) {
        request(
          `https://banidb.com/databases/${database[dbPlatform].md5}`,
          (error, response, newestDBHash) => {
            if (!error && response.statusCode === 200) {
              const curDBHash = store.get('curDBHash');
              if (force || curDBHash !== newestDBHash) {
                const dbCompressed = path.resolve(
                  userDataPath,
                  database[dbPlatform].dbCompressedName,
                );
                progress(
                  request(`https://banidb.com/databases/${database[dbPlatform].dbCompressedName}`),
                )
                  .on('progress', state => {
                    const win = remote.getCurrentWindow();
                    win.setProgressBar(state.percent);
                    ipcRenderer.emit('database-progress', state);
                  })
                  .on('end', () => {
                    ipcRenderer.emit('database-progress', { percent: 1 });
                    extract(dbCompressed, { dir: newDBFolder }, err0 => {
                      if (err0) {
                        // ToDo: Log errors
                        // eslint-disable-next-line no-console
                        console.log(err0);
                      }
                      fs.chmodSync(newDBPath, '755');
                      // Save the hash for comparison next time
                      store.set('curDBHash', newestDBHash);
                      // Delete compressed database
                      fs.unlinkSync(dbCompressed);
                      // Replace current DB file with new version
                      fs.renameSync(newDBPath, dbPath);
                      if (dbPlatform === 'realm') {
                        fs.renameSync(newDBSchema, dbSchema);
                      }
                      module.exports.initDB();
                      // Delete old DBs
                      // TODO: Update to check if directory and use fs.rmdir
                      // TODO: Add sttmdesktop.realm.management
                      const oldDBs = ['data.db', 'sttmdesktop.realm', 'sttmdesktop.realm.lock'];
                      oldDBs.forEach(oldDB => {
                        const oldDBPath = path.resolve(userDataPath, oldDB);
                        fs.access(oldDBPath, err => {
                          if (!err) {
                            fs.unlink(oldDBPath, err1 => {
                              if (err1) {
                                // eslint-disable-next-line no-console
                                console.log(`Could not delete old database ${oldDB}: ${err1}`);
                              }
                            });
                          }
                        });
                      });
                      const win = remote.getCurrentWindow();
                      win.setProgressBar(-1);
                    });
                  })
                  .pipe(fs.createWriteStream(dbCompressed));
              }
            }
          },
        );
      } else if (force) {
        global.core.search.offline(10);
      }
    });
  },

  initDB() {
    // dbSchema = dbSchemaPath(userDataPath);
    // newDBSchema = dbSchemaPath(newDBFolder);
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
Array.from($titleButtons).forEach(el => {
  el.addEventListener('click', e => windowAction(e));
});

const $minimize = document.querySelectorAll('.navigator-header .toggle-minimize');
const $minimizeIcons = document.querySelectorAll('.navigator-header .toggle-minimize i');

if ($minimize) {
  Array.prototype.forEach.call($minimize, minimize => {
    minimize.addEventListener('click', () => {
      Array.prototype.forEach.call($minimizeIcons, element => {
        element.classList.toggle('disabled');
      });
      document.getElementById('navigator').classList.toggle('minimized');
      if (global.webview) global.webview.send('navigator-toggled');
    });
  });
}
