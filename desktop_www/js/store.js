const electron = require('electron');
const path = require('path');
const fs = require('fs');

class Store {
  constructor(opts) {
    // Renderer process has to get `app` module via `remote`, whereas the main process can get it directly
    // app.getPath('userData') will return a string of the user's app data directory path.
    const userDataPath = (electron.app || electron.remote.app).getPath('userData');
    // We'll use the `configName` property to set the file name and path.join to bring it all together as a string
    this.path = path.join(userDataPath, opts.configName + '.json');
    
    this.data = parseDataFile(this.path, opts.defaults);
    this.defaults = opts.defaults;
  }
  
  // This will just return the property on the `data` object
  get(key, schema = this.data, original = null, gettingDefaults = false) {
    if (typeof original !== "string") {
      original = key;
    }
    let _index = key.indexOf(".");
    if (_index > -1) {
      let child = schema[key.substring(0, _index)]
      if (!child) {
        return this.get(original, this.defaults);
      }
      return this.get(key.substring(_index+1), child, original, gettingDefaults);
    }
    // Check if key exists, otherwise return from defaults
    if (typeof schema[key] !== "undefined") {
      // If we're not already returning defaults and the key exists, check if it has children, otherwise return it
      if (!gettingDefaults && typeof schema[key] === "object") {
        // If it has children, see if any unwritten should be pulled in from defaults
        let   prefs     = schema[key];
        const defaults  = this.get(original, this.defaults, null, true);
        prefs           = mergePrefs(prefs, defaults);
        return prefs;
      } else {
        return schema[key];
      }
    } else {
      return this.get(original, this.defaults, null, true);
    }
  }
  
  // ...and this will set it
  set(key, val) {
    let   schema    = this.data;  // a moving reference to internal objects within obj
    const pathList  = key.split('.');
    const len       = pathList.length;
    for (let i = 0; i < len-1; i++) {
      const elem = pathList[i];
      if (!schema[elem]) schema[elem] = {}
      schema = schema[elem];
    }

    schema[pathList[len-1]] = val;
    // Wait, I thought using the node.js' synchronous APIs was bad form?
    // We're not writing a server so there's not nearly the same IO demand on the process
    // Also if we used an async API and our app was quit before the asynchronous write had a chance to complete,
    // we might lose that data. Note that in a real app, we would try/catch this.
    fs.writeFileSync(this.path, JSON.stringify(this.data));
  }

  delete(key) {
    delete this.data[key];
    fs.writeFileSync(this.path, JSON.stringify(this.data));
  }
}

function parseDataFile(filePath, defaults) {
  // We'll try/catch it in case the file doesn't exist yet, which will be the case on the first application run.
  // `fs.readFileSync` will return a JSON string which we then parse into a Javascript object
  try {
    return JSON.parse(fs.readFileSync(filePath));
  } catch(error) {
    // if there was some kind of error, return the passed in defaults instead.
    return defaults;
  }
}

function mergePrefs(prefs, defaults) {
  let merged = {};
  for (const i in defaults) {
    if (typeof prefs[i] !== "undefined") {
      if (typeof defaults[i] == "object" && prefs[i]) {
        merged[i] = mergePrefs(prefs[i], defaults[i]);
      } else {
        merged[i] = prefs[i];
      }
    } else {
      merged[i] = defaults[i];
    }
  }
  return merged;
}

// expose the class
module.exports = Store;
