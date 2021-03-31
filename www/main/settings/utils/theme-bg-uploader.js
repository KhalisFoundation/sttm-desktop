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
    console.error(error);
  }

  return false;
};

export const upsertCustomBackgrounds = (responseCallback = () => {}) => {
  try {
    if (!fs.existsSync(userBackgroundsPath)) mkdir(userBackgroundsPath);
  } catch (error) {
    console.error(error);
  }

  fs.readdir(userBackgroundsPath, (error, files) => {
    if (error) {
      console.log(error);
    } else {
      responseCallback(
        files
          .map(file => ({
            name: file,
            'background-image': `${userBackgroundsPath}/${file.replace(/(\s)/g, '\\ ')}`,
            time: fs.statSync(path.resolve(userBackgroundsPath, file)).mtime.getTime(),
          }))
          .sort((a, b) => b.time - a.time),
      );
    }
  });
};

export const removeCustomBackgroundFile = imagePath => {
  fs.unlink(imagePath, deleteError => {
    if (deleteError) console.log(deleteError);
  });
};

export const uploadImage = async evt => {
  try {
    if (!fs.existsSync(userBackgroundsPath)) await mkdir(userBackgroundsPath);
  } catch (error) {
    console.error(error);
  }

  try {
    const filePath = evt.target.files[0].path;
    // eslint-disable-next-line no-param-reassign
    evt.target.value = '';

    if (imageCheck(filePath)) {
      const files = await imagemin([filePath], userBackgroundsPath);
      if (files) {
        store.setUserPref('app.themebg', {
          type: 'custom',
          url: `${files[0].path}`.replace(/(\s)/g, '\\ '),
        });

        GlobalState.getActions().userSettings.setThemeBg({
          type: 'custom',
          url: `${files[0].path}`.replace(/(\s)/g, '\\ '),
        });

        global.core.platformMethod('updateSettings');
      }
    } else {
      console.error('theme error filepath');
    }
  } catch (error) {
    console.error(error);
  }
};
