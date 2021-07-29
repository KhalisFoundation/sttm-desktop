import convertObjToCamelCase from '../../utils/convert-object-to-camel-case';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { settings } = require('../../../../configs/user-settings.json');

console.log(app.getPath('userData'));
const userDataPath = app.getPath('userData');
export const userConfigPath = path.join(userDataPath, 'user-data.json');

function parseDataFile(filePath) {
  // We'll try/catch it in case the file doesn't exist yet,
  // which will be the case on the first application run.
  // `fs.readFileSync` will return a JSON string which we then parse into a Javascript object
  try {
    return JSON.parse(fs.readFileSync(filePath));
  } catch (error) {
    // if there was some kind of error, return the passed in defaults instead.
    const defaultSettings = {};
    Object.keys(settings).forEach(key => {
      defaultSettings[key] = settings[key].initialValue;
    });
    return defaultSettings;
  }
}

export const savedSettings = parseDataFile(userConfigPath);

export const savedSettingsCamelCase = () => {
  return convertObjToCamelCase(parseDataFile(userConfigPath));
};
