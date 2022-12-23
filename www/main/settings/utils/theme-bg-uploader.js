import GlobalState from '../../common/store/GlobalState';

const remote = require('@electron/remote');
const fs = require('fs');
const path = require('path');
const util = require('util');
const sharp = require('sharp');
const readChunk = require('read-chunk');
const imageType = require('image-type');
const url = require('url');

const { store } = remote.require('./app');

const mkdir = util.promisify(fs.mkdir);
const userDataPath = remote.app.getPath('userData');
const userBackgroundsPath = path.resolve(userDataPath, 'user_backgrounds');

const errorAlert = (error) => {
  /* eslint-disable-next-line no-alert */
  alert(error);
};

const imageCheck = (filePath) => {
  const acceptedExtensions = ['png', 'jpg'];
  const acceptedMimeTypes = ['image/png', 'image/jpeg'];

  try {
    const buffer = readChunk.sync(filePath, 0, 12);
    const fileMeta = imageType(buffer);
    if (fileMeta) {
      return acceptedExtensions.includes(fileMeta.ext) && acceptedMimeTypes.includes(fileMeta.mime);
    }
  } catch (error) {
    errorAlert(error);
  }

  return false;
};

export const removeCustomBackgroundFile = (imagePath) => {
  fs.unlink(imagePath, (deleteError) => {
    if (deleteError) {
      errorAlert('Unable to delete file');
      throw deleteError;
    }
  });
};

export const uploadImage = async (evt) => {
  try {
    if (!fs.existsSync(userBackgroundsPath)) await mkdir(userBackgroundsPath);
  } catch (error) {
    errorAlert('Unable to create folder');
  }
  return new Promise((resolve, reject) => {
    try {
      const filePath = evt.target.files[0].path;
      const newPath = path.resolve(userBackgroundsPath, evt.target.files[0].name);
      // eslint-disable-next-line no-param-reassign
      evt.target.value = '';

      if (imageCheck(filePath)) {
        sharp(filePath)
          .jpeg({ mozjpeg: true })
          .toFile(newPath, (err) => {
            if (err) {
              errorAlert('Unable to save file');
              reject();
            } else {
              const customThemeObj = {
                type: 'custom',
                url: url.pathToFileURL(newPath),
              };

              store.setUserPref('app.themebg', customThemeObj);
              GlobalState.getActions().userSettings.setThemeBg(customThemeObj);
              global.core.platformMethod('updateSettings');
              resolve();
            }
          });
      } else {
        errorAlert('File must be in .png or .jpg format');
        reject();
      }
    } catch (error) {
      errorAlert('Unknown error occured');
      reject();
    }
  });
};
