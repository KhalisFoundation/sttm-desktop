const remote = require('@electron/remote');
const fs = require('fs');
const path = require('path');

const userDataPath = remote.app.getPath('userData');
const userBackgroundsPath = path.resolve(userDataPath, 'user_backgrounds');
const userBackgroundsURL = new URL(`file:///${userBackgroundsPath}`).href;

const errorAlert = (error) => {
  /* eslint-disable-next-line no-alert */
  alert(error);
};

export const upsertCustomBackgrounds = (responseCallback = () => {}) => {
  try {
    // Synchronous: the readdir below ran before the folder existed on a fresh install, and
    // the "Error fetching files" alert then blocked the window the first time Settings opened.
    if (!fs.existsSync(userBackgroundsPath)) fs.mkdirSync(userBackgroundsPath);
  } catch (error) {
    errorAlert('Unable to create File');
  }

  fs.readdir(userBackgroundsPath, (error, files) => {
    if (error) {
      errorAlert('Error fetching files');
    } else {
      responseCallback(
        files
          .map((file) => ({
            name: file,
            path: `${userBackgroundsPath}/${file}`,
            'background-image': `${userBackgroundsURL}/${file}`,
            'background-image-path': `${userBackgroundsPath}/${file}`,
            time: fs.statSync(path.resolve(userBackgroundsPath, file)).mtime.getTime(),
          }))
          .sort((a, b) => b.time - a.time),
      );
    }
  });
};
