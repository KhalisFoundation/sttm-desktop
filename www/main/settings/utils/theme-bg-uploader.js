import GlobalState from '../../common/store/GlobalState';

const remote = require('@electron/remote');
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

const errorAlert = (error) => {
  /* eslint-disable no-alert */
  alert(error);
  /* eslint-enable */
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
    errorAlert(errorAlert);
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

  try {
    const filePath = evt.target.files[0].path;
    // eslint-disable-next-line no-param-reassign
    evt.target.value = '';

    if (imageCheck(filePath)) {
      const files = await imagemin([filePath], userBackgroundsPath);
      if (files) {
        const fileUrl = new URL(`file:///${files[0].path}`).href;
        const customThemeObj = {
          type: 'custom',
          url: `${fileUrl}`.replace(/(%20)/g, '\\ '),
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
