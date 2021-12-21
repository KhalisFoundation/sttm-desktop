const { ipcRenderer } = require('electron');
const electron = require('electron');
const extract = require('extract-zip');
const fs = require('fs');
const isOnline = require('is-online');
const path = require('path');
const fetch = require('node-fetch');
const { Agent } = require('https');
const Progress = require('node-fetch-progress');
const tingle = require('../assets/js/vendor/tingle');

const ISRGCAs = [
  `-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----`,
];

const agent = new Agent({ ca: ISRGCAs });

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
      // $search.placeholder = i18n.t('DATABASE.DOWNLOADING');
      // $search.dataset.databaseState = 'loading';
    }
    isOnline().then(online => {
      if (online) {
        fetch(`https://banidb.com/databases/${database[dbPlatform].md5}`, {
          agent,
        })
          .then(response => {
            if (response.ok) {
              return response.text();
            }
            throw new Error('Something went wrong');
          })
          .then(async newestDBHash => {
            const curDBHash = store.get('curDBHash');
            if (force || curDBHash !== newestDBHash) {
              const dbCompressed = path.resolve(
                userDataPath,
                database[dbPlatform].dbCompressedName,
              );
              const dbResponse = await fetch(
                `https://banidb.com/databases/${database[dbPlatform].dbCompressedName}`,
                {
                  agent,
                },
              );
              const fileStream = fs.createWriteStream(dbCompressed);
              dbResponse.body.pipe(fileStream);
              fileStream.on('finish', () => {
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
              });
              const dbProgress = new Progress(dbResponse, { throttle: 100 });
              dbProgress.on('progress', ({ done, total }) => {
                const percent = done / total;
                const win = remote.getCurrentWindow();
                win.setProgressBar(percent);
                ipcRenderer.emit('database-progress', { percent });
              });
            }
          })
          .catch(error => {
            console.log(error);
          });
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
