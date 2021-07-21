import { remote } from 'electron';

const fs = require('fs');
const path = require('path');
const util = require('util');

const mkdir = util.promisify(fs.mkdir);
const userDataPath = remote.app.getPath('userData');
const userBackgroundsPath = path.resolve(userDataPath, 'user_backgrounds');
const userBackgroundsURL = new URL(`file:///${userBackgroundsPath}`).href;

const errorAlert = error => {
  alert(error);
};

export const upsertCustomBackgrounds = (responseCallback = () => {}) => {
  try {
    if (!fs.existsSync(userBackgroundsPath)) mkdir(userBackgroundsPath);
  } catch (error) {
    errorAlert('Unable to create File');
  }

  fs.readdir(userBackgroundsPath, (error, files) => {
    if (error) {
      errorAlert('Error fetching files');
    } else {
      responseCallback(
        files
          .map(file => ({
            name: file,
            'background-image': `${userBackgroundsURL}/${file.replace(/(\s)/g, '\\ ')}`,
            time: fs.statSync(path.resolve(userBackgroundsPath, file)).mtime.getTime(),
          }))
          .sort((a, b) => b.time - a.time),
      );
    }
  });
};
