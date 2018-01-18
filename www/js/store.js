const electron = require('electron');
const fs = require('fs');
const ldDefaultsDeep = require('lodash.defaultsdeep');
const ldGet = require('lodash.get');
const ldSet = require('lodash.set');
const path = require('path');

function parseDataFile(filePath, defaults) {
  // We'll try/catch it in case the file doesn't exist yet,
  // which will be the case on the first application run.
  // `fs.readFileSync` will return a JSON string which we then parse into a Javascript object
  try {
    return JSON.parse(fs.readFileSync(filePath));
  } catch (error) {
    // if there was some kind of error, return the passed in defaults instead.
    return defaults;
  }
}

class Store {
  constructor(opts) {
    // Renderer process has to get `app` module via `remote`,
    // whereas the main process can get it directly
    // app.getPath('userData') will return a string of the user's app data directory path.
    const userDataPath = (electron.app || electron.remote.app).getPath('userData');
    // We'll use the `configName` property to set the file name and path.join
    // to bring it all together as a string
    this.path = path.join(userDataPath, `${opts.configName}.json`);

    this.data = parseDataFile(this.path, opts.defaults);
    this.defaults = opts.defaults;

    // Write preferences to localStorage for viewers
    this.combined = ldDefaultsDeep(this.data, this.defaults);
    if (typeof localStorage === 'object') {
      localStorage.setItem('prefs', JSON.stringify(this.combined.userPrefs));
    }
  }

  // This will return the default values
  getDefaults() {
    return this.defaults;
  }

  // This will just return the property on the `data` object
  get(key) {
    return ldGet(this.combined, key);
  }

  // ...and this will set it
  set(key, val) {
    ldSet(this.data, key, val);
    this.combined = ldDefaultsDeep(this.data, this.defaults);

    // Wait, I thought using the node.js' synchronous APIs was bad form?
    // We're not writing a server so there's not nearly the same IO demand on the process
    // Also if we used an async API and our app was quit
    // before the asynchronous write had a chance to complete,
    // we might lose that data. Note that in a real app, we would try/catch this.
    fs.writeFileSync(this.path, JSON.stringify(this.data));

    // Update localStorage for viewer
    if (typeof localStorage === 'object') {
      localStorage.setItem('prefs', JSON.stringify(this.combined.userPrefs));
    }
  }

  delete(key) {
    delete this.data[key];
    this.combined = ldDefaultsDeep(this.data, this.defaults);

    fs.writeFileSync(this.path, JSON.stringify(this.data));

    // Update localStorage for viewer
    if (typeof localStorage === 'object') {
      localStorage.setItem('prefs', JSON.stringify(this.combined.userPrefs));
    }
  }
}

// expose the class
module.exports = Store;
