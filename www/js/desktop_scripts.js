const electron = require('electron');
const AdmZip = require('adm-zip');
const decompress = require('decompress');
const decompressBzip2 = require('decompress-bzip2');
const fs = require('fs');
const isOnline = require('is-online');
const path = require('path');
const request = require('request');
const progress = require('request-progress');
const sqlite3 = require('sqlite3').verbose();
const Realm = require('realm');

const search = require('./search-database');
const realmDB = require('./realm-db');

const { remote } = electron;
const ipc = electron.ipcRenderer;
const userDataPath = remote.app.getPath('userData');
const dbPath = path.resolve(userDataPath, 'sttmdesktop.db');
const realmCompressed = path.resolve(userDataPath, 'sttmdesktop.realm.bz2');

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
  search,
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
        request('https://banidb.com/databases/sttmdesktop.md5', (error, response, newestDBHash) => {
          if (!error && response.statusCode === 200) {
            const curDBHash = store.get('curDBHash');
            if (force || curDBHash !== newestDBHash) {
              const dbZip = path.resolve(userDataPath, 'sttmdesktop.zip');
              progress(request('https://banidb.com/databases/sttmdesktop.zip'))
                .on('progress', (state) => {
                  const win = remote.getCurrentWindow();
                  win.setProgressBar(state.percent);
                  global.core.search.updateDLProgress(state);
                })
                .on('end', () => {
                  const zip = new AdmZip(dbZip);
                  zip.extractEntryTo('sttmdesktop.db', userDataPath, true, true);
                  module.exports.initDB();
                  store.set('curDBHash', newestDBHash);
                  fs.unlinkSync(dbZip);
                  // Delete pre-4.0 DB
                  const oldDB = path.resolve(userDataPath, 'data.db');
                  fs.access(oldDB, (err) => {
                    if (!err) {
                      fs.unlink(oldDB, (err1) => {
                        if (err1) {
                          // eslint-disable-next-line no-console
                          console.log(`Could not delete old database: ${err1}`);
                        }
                      });
                    }
                  });
                  const win = remote.getCurrentWindow();
                  win.setProgressBar(-1);
                })
                .pipe(fs.createWriteStream(dbZip));
            }
          }
        });
      } else if (force) {
        global.core.search.offline(10);
      }
    });
  },

  initDB() {
    const db = new sqlite3.Database(dbPath);
    this.db = db;
    search.db = db;
    if (global.core) {
      global.core.search.initSearch();
    }
    console.time('decompress');
    decompress(realmCompressed, userDataPath,
      {
        plugins: [
          decompressBzip2({ path: 'sttmdesktop.realm' }),
        ],
      })
      .then(() => {
        console.timeEnd('decompress');
      });
    /* db.all('SELECT * FROM Writer', (err, rows) => {
      this.writeRealm(rows);
    }); */
  },

  writeRealm(rows) {
    Realm.open(realmDB.realmMetaSchema)
      .then((realm) => {
        realm.write(() => {
          console.log(rows.length);
          let x = 1;
          rows.forEach((row) => {
            realm.create('Writer', row);
            if (x % 10 === 0) {
              console.log(x);
            }
            x += 1;
          });
        });
        realm.close();
      });
  },

  updateSettings() {
    global.webview.send('update-settings');
    global.platform.ipc.send('update-settings');
  },

  updateNotificationsTimestamp(time) {
    store.setUserPref('notification-timestamp', time);
  },
};

const $titleButtons = document.querySelectorAll('#titlebar .controls a');
Array.from($titleButtons).forEach((el) => {
  el.addEventListener('click', e => windowAction(e));
});
