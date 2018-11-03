const sqlite3 = require('sqlite3').verbose();
const electron = require('electron');
const path = require('path');

const { remote } = electron;
const userDataPath = remote.app.getPath('userData');
const dbPath = path.resolve(userDataPath, 'sttmdesktop.db');

const db = new sqlite3.Database(dbPath);

module.exports = db;
