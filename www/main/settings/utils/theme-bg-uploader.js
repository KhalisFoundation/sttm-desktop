/* eslint-disable no-unused-vars */
import { remote } from 'electron';

import { themes } from '../../theme_editor';

const fs = require('fs');
const path = require('path');
const util = require('util');
const imagemin = require('imagemin');
const readChunk = require('read-chunk');
const imageType = require('image-type');

const { i18n, store } = remote.require('./app');

// const readChunk = require('read-chunk');
// const imageType = require('image-type');

const mkdir = util.promisify(fs.mkdir);
const userDataPath = remote.app.getPath('userData');
const userBackgroundsPath = path.resolve(userDataPath, 'user_backgrounds');

const themesWithCustomBg = themes
  .filter(theme => theme.type === 'COLOR' || theme.type === 'SPECIAL')
  .map(theme => theme.key);

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
    // uploadErrorNotification(i18n.t('THEMES.FILE_VALIDATE_ERR', { error }));
  }

  return false;
};

// export const upsertCustomBackgrounds = userBackgroundsPath => {
//   const recentBgsContainer =
//     document.querySelector('.recentbgs-container') ||
//     themesContainer.appendChild(h('ul.recentbgs-container'));
//   recentBgsContainer.innerHTML = '';

//   try {
//     if (!fs.existsSync(userBackgroundsPath)) mkdir(userBackgroundsPath);
//   } catch (error) {
//     console.error(error);
//     // uploadErrorNotification(i18n.t('THEMES.DIR_CREATE_ERR', { error }));
//   }

//   fs.readdir(userBackgroundsPath, (error, files) => {
//     if (error) {
//       console.error(error);
//       // uploadErrorNotification(i18n.t('THEMES.UNABLE_TO_GET', { error }));
//     } else {
//       const sortedFiles = files
//         .map(fileName => ({
//           name: fileName,
//           time: fs.statSync(path.resolve(userBackgroundsPath, fileName)).mtime.getTime(),
//         }))
//         .sort((a, b) => b.time - a.time)
//         .map(v => v.name);

//       sortedFiles.forEach(file => {
//         const fullPath = path.resolve(userBackgroundsPath, file);
//         if (imageCheck(fullPath)) {
//           recentBgsContainer.appendChild(recentSwatchFactory(fullPath));
//         } else {
//           fs.unlink(fullPath, deleteError => {
//             if (deleteError)
//               uploadErrorNotification(i18n.t('THEMES.UNABLE_TO_DEL', { deleteError }));
//           });
//         }
//       });
//     }
//     toggleRecentBgHeader();
//     toggleFileInput();
//   });
// };

export const uploadImage = async evt => {
  // store.setUserPref('app.theme', themesWithCustomBg[0]);
  console.log('uploadImage');
  try {
    if (!fs.existsSync(userBackgroundsPath)) await mkdir(userBackgroundsPath);
  } catch (error) {
    console.error(error);
    // uploadErrorNotification(i18n.t('THEMES.DIR_CREATE_ERR2'));
  }

  try {
    const filePath = evt.target.files[0].path;
    console.log(filePath);
    // eslint-disable-next-line no-param-reassign
    evt.target.value = '';

    if (imageCheck(filePath)) {
      const files = await imagemin([filePath], userBackgroundsPath);
      console.log(filePath);
      if (files) {
        store.setUserPref('app.themebg', {
          type: 'custom',
          url: `${files[0].path}`.replace(/(\s)/g, '\\ '),
        });

        console.log(store.getUserPref('app.themebg'));

        // upsertCustomBackgrounds(userBackground);
        // console.log(files, userBackgroundsPath);
        // analytics.trackEvent('theme', 'custom');
        global.core.platformMethod('updateSettings');
      }
    } else {
      console.error('theme error filepath');
      // throw new Error(i18n.t('THEMES.ALLOWED_IMGS_MSG'));
    }
  } catch (error) {
    console.error(error);
    // uploadErrorNotification(i18n.t('THEMES.USING_ERR'), 5000);
  }
};
