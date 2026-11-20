const { ipcRenderer } = require('electron');
const electron = require('electron');
const extract = require('extract-zip');
const fs = require('fs');
const isOnline = require('is-online');
const path = require('path');
const request = require('request');
const progress = require('request-progress');
const remote = require('@electron/remote');
const moment = require('moment');
const tingle = require('../assets/js/vendor/tingle');

const { isUnsupportedWindow } = remote.require('./app');
const { i18n } = require('./common/i18n');

const ipc = electron.ipcRenderer;
const userDataPath = remote.app.getPath('userData');
const database = {
  realm: {
    dbCompressedName: 'sttmdesktop-evergreen-v2.zip',
    dbName: 'sttmdesktop-evergreen-v2.realm',
    dbSchema: 'realm-schema-evergreen.json',
    md5: 'sttmdesktop-evergreen-v2.md5',
  },
};

const aiTranslationsDB = {
  dbCompressedName: 'ai-translations.zip',
  dbName: 'ai-translations.db',
  md5: 'ai-translations.md5',
};

const dbPlatform = 'realm';
const dbSchemaPath = (schemaPath) =>
  !database[dbPlatform].dbSchema || path.resolve(schemaPath, database[dbPlatform].dbSchema);

const dbPath = path.resolve(userDataPath, database[dbPlatform].dbName);
const dbSchema = dbSchemaPath(userDataPath);
const newDBFolder = path.resolve(userDataPath, 'new-db');
const newDBPath = path.resolve(newDBFolder, database[dbPlatform].dbName);
const newDBSchema = dbSchemaPath(newDBFolder);

const { store } = remote.require('./app');

// schemaVersion from a realm schema file, or null if it can't be read. Read with fs
// rather than require, which would return a cached copy.
const getSchemaVersion = (schemaPath) => {
  try {
    return JSON.parse(fs.readFileSync(schemaPath, 'utf8')).schemaVersion;
  } catch (err) {
    return null;
  }
};

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
  if (timeStamp) {
    global.core.menu.getNotifications(timeStamp, global.core.menu.showNotificationsModal);
  } else {
    const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
    store.set('userPrefs.notification-timestamp', currentTime);
  }

  setInterval(() => {
    timeStamp = store.get('userPrefs.notification-timestamp');
    global.core.menu.getNotifications(timeStamp, addBadgeToNotification);
  }, POLLING_INTERVAL);
}

module.exports = {
  ipc,
  store,

  getRealmDBLastModified() {
    try {
      if (fs.existsSync(dbPath)) {
        const stats = fs.statSync(dbPath);
        const lastModified = new Date(stats.mtime);
        const formattedDate = moment(lastModified).format('LL');
        return formattedDate;
      }
      return null;
    } catch (error) {
      return null;
    }
  },

  init() {
    // A database with a new schema version is only put in place at launch, before
    // anything has the realm file open
    this.installPendingDB();

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
    this.downloadAiTranslationsDB();

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

  // Puts a database that was downloaded with a new schema version (see downloadLatestDB)
  // in place. Runs at launch, while nothing has the current realm file open.
  installPendingDB() {
    const pendingDBHash = store.get('pendingDBHash');
    if (!pendingDBHash) return;

    try {
      if (fs.existsSync(newDBPath) && (dbPlatform !== 'realm' || fs.existsSync(newDBSchema))) {
        fs.renameSync(newDBPath, dbPath);
        if (dbPlatform === 'realm') {
          fs.renameSync(newDBSchema, dbSchema);
        }
        store.set('curDBHash', pendingDBHash);
      }
    } catch (err) {
      /* eslint-disable-next-line no-console */
      console.log(`Could not install downloaded database: ${err}`);
    }
    // If the files were missing or could not be moved, the download is tried again
    store.delete('pendingDBHash');
  },

  downloadLatestDB(force = false) {
    if (force) {
      localStorage.setItem('isDbDownloaded', false);
    } else {
      localStorage.setItem('isDbDownloaded', true);
    }
    isOnline().then((online) => {
      if (online) {
        request(
          `https://banidb.blob.core.windows.net/database/${database[dbPlatform].md5}`,
          (error, response, newestDBHash) => {
            if (!error && response.statusCode === 200) {
              const curDBHash = store.get('curDBHash');
              if (force || curDBHash !== newestDBHash) {
                const dbCompressed = path.resolve(
                  userDataPath,
                  database[dbPlatform].dbCompressedName,
                );
                progress(
                  request(
                    `https://banidb.blob.core.windows.net/database/${database[dbPlatform].dbCompressedName}`,
                  ),
                )
                  .on('progress', (state) => {
                    const win = remote.getCurrentWindow();
                    win.setProgressBar(state.percent);
                    ipcRenderer.emit('database-progress', JSON.stringify(state));
                  })
                  .pipe(fs.createWriteStream(dbCompressed))
                  // Wait for the zip to be fully written before extracting it
                  .on('finish', () => {
                    ipcRenderer.emit('database-progress', JSON.stringify({ percent: 1 }));
                    extract(dbCompressed, { dir: newDBFolder })
                      .then(() => {
                        fs.chmodSync(newDBPath, '755');
                        // Delete compressed database
                        fs.unlinkSync(dbCompressed);

                        // The open database keeps using the schema it was opened with,
                        // so a new schema version only works after a restart. Keep the
                        // new files in new-db and put them in place on the next launch.
                        const curSchemaVersion = getSchemaVersion(dbSchema);
                        if (
                          fs.existsSync(dbPath) &&
                          curSchemaVersion !== null &&
                          curSchemaVersion !== getSchemaVersion(newDBSchema)
                        ) {
                          store.set('pendingDBHash', newestDBHash);
                          remote.getCurrentWindow().setProgressBar(-1);
                          ipcRenderer.send('database-update-pending');
                          return;
                        }

                        // Replace current DB file with new version
                        fs.renameSync(newDBPath, dbPath);
                        if (dbPlatform === 'realm') {
                          fs.renameSync(newDBSchema, dbSchema);
                        }
                        // Save the hash for comparison next time
                        store.set('curDBHash', newestDBHash);
                        store.delete('pendingDBHash');
                        localStorage.setItem('isDbDownloaded', true);
                        module.exports.initDB();
                        // Delete old DBs
                        // TODO: Update to check if directory and use fs.rmdir
                        // TODO: Add sttmdesktop.realm.management
                        const oldDBs = ['data.db', 'sttmdesktop.realm', 'sttmdesktop.realm.lock'];
                        oldDBs.forEach((oldDB) => {
                          const oldDBPath = path.resolve(userDataPath, oldDB);
                          fs.access(oldDBPath, (err) => {
                            if (!err) {
                              fs.unlink(oldDBPath, (err1) => {
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
                      })
                      .catch((err) => {
                        /* eslint-disable-next-line no-console */
                        console.log(`Could not install database: ${err}`);
                      });
                  });
              }
            }
          },
        );
      } else if (force) {
        global.core.search.offline(10);
      }
    });
  },

  // Downloads the AI translations database (PSS) into userData when it is missing or
  // its md5 on the server has changed. Each version is saved under its own name
  // (ai-translations-<md5>.db) because sqlite keeps the current file open in every
  // window that shows a translation, and Windows can't replace an open file.
  downloadAiTranslationsDB() {
    const curFile = store.get('aiTranslationsFile');
    const curFileExists = !!curFile && fs.existsSync(path.resolve(userDataPath, curFile));

    // Remove versions left behind by earlier updates
    fs.readdir(userDataPath, (readErr, files) => {
      if (readErr) return;
      files
        .filter((file) => /^ai-translations-.+\.db$/.test(file) && file !== curFile)
        .forEach((file) => fs.unlink(path.resolve(userDataPath, file), () => {}));
    });

    isOnline().then((online) => {
      if (!online) return;
      request(
        `https://banidb.blob.core.windows.net/database/${aiTranslationsDB.md5}`,
        (error, response, newestHash) => {
          if (error || response.statusCode !== 200) return;
          if (curFileExists && store.get('aiTranslationsHash') === newestHash) return;

          const hashMatch = newestHash.match(/[a-f0-9]{32}/i);
          const newFile = `ai-translations-${hashMatch ? hashMatch[0] : Date.now()}.db`;
          const dbCompressed = path.resolve(userDataPath, aiTranslationsDB.dbCompressedName);
          const extractFolder = path.resolve(userDataPath, 'new-ai-translations');
          let downloaded = false;

          request(
            `https://banidb.blob.core.windows.net/database/${aiTranslationsDB.dbCompressedName}`,
          )
            .on('response', (zipResponse) => {
              downloaded = zipResponse.statusCode === 200;
            })
            .on('error', (err) => {
              /* eslint-disable-next-line no-console */
              console.log(`Could not download AI translations: ${err}`);
            })
            .pipe(fs.createWriteStream(dbCompressed))
            .on('finish', () => {
              if (!downloaded) {
                fs.rm(dbCompressed, { force: true }, () => {});
                return;
              }
              extract(dbCompressed, { dir: extractFolder })
                .then(() => {
                  fs.renameSync(
                    path.resolve(extractFolder, aiTranslationsDB.dbName),
                    path.resolve(userDataPath, newFile),
                  );
                  store.set('aiTranslationsFile', newFile);
                  // Save the hash for comparison next time
                  store.set('aiTranslationsHash', newestHash);
                  // Windows reopen the new file on their next lookup; the old one is
                  // removed on the next launch, once nothing has it open
                  ipcRenderer.send('ai-translations-updated');
                })
                .catch((err) => {
                  /* eslint-disable-next-line no-console */
                  console.log(`Could not install AI translations: ${err}`);
                })
                .finally(() => {
                  fs.rm(dbCompressed, { force: true }, () => {});
                  fs.rm(extractFolder, { recursive: true, force: true }, () => {});
                });
            });
        },
      );
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
Array.from($titleButtons).forEach((el) => {
  el.addEventListener('click', (e) => windowAction(e));
});

const $minimize = document.querySelectorAll('.navigator-header .toggle-minimize');
const $minimizeIcons = document.querySelectorAll('.navigator-header .toggle-minimize i');

if ($minimize) {
  Array.prototype.forEach.call($minimize, (minimize) => {
    minimize.addEventListener('click', () => {
      Array.prototype.forEach.call($minimizeIcons, (element) => {
        element.classList.toggle('disabled');
      });
      document.getElementById('navigator').classList.toggle('minimized');
      if (global.webview) global.webview.send('navigator-toggled');
    });
  });
}
