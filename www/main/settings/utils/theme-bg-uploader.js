import { remote } from 'electron';
import GlobalState from '../../common/store/GlobalState';

const fs = require('fs');
const path = require('path');
const util = require('util');
const imagemin = require('imagemin');
const readChunk = require('read-chunk');
const imageType = require('image-type');

const { store } = remote.require('./app');

const mkdir = util.promisify(fs.mkdir);
const userDataPath = remote.app.getPath('userData');
const userBackgroundsPath = path.resolve(userDataPath, 'user_backgrounds');

const errorAlert = error => {
  alert(error);
};

const imageCheck = filePath => {
  const acceptedExtensions = ['png', 'jpg'];
  const acceptedMimeTypes = ['image/png', 'image/jpeg'];

  try {
    const buffer = readChunk.sync(filePath, 0, 12);
    const fileMeta = imageType(buffer);
    if (fileMeta) {
      return acceptedExtensions.includes(fileMeta.ext) && acceptedMimeTypes.includes(fileMeta.mime);
    }
  } catch (error) {
    errorAlert(errorAlert);
  }

  return false;
};

export const removeCustomBackgroundFile = imagePath => {
  fs.unlink(imagePath, deleteError => {
    if (deleteError) errorAlert('Unable to delete file');
  });
};

export const uploadImage = async evt => {
  try {
    if (!fs.existsSync(userBackgroundsPath)) await mkdir(userBackgroundsPath);
  } catch (error) {
    errorAlert('Unable to create folder');
  }

  try {
    const filePath = evt.target.files[0].path;
    // eslint-disable-next-line no-param-reassign
    evt.target.value = '';

    if (imageCheck(filePath)) {
      const files = await imagemin([filePath], userBackgroundsPath);
      if (files) {
        const customThemeObj = {
          type: 'custom',
          url: `${files[0].path}`.replace(/(\s)/g, '\\ '),
        };

        store.setUserPref('app.themebg', customThemeObj);
        GlobalState.getActions().userSettings.setThemeBg(customThemeObj);
        global.core.platformMethod('updateSettings');
      }
    } else {
      errorAlert('File must be in .png or .jpg format');
    }
  } catch (error) {
    errorAlert('Unknown error occured');
  }
};
