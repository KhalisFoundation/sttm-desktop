import React from 'react';

import { remote } from 'electron';
import { useStoreActions, useStoreState } from 'easy-peasy';
import { Tile } from '../../common/sttm-ui';

import { themes } from '../../theme_editor';

const h = require('hyperscript');
const fs = require('fs');
const path = require('path');
const util = require('util');

const userDataPath = remote.app.getPath('userData');
const mkdir = util.promisify(fs.mkdir);
const userBackgroundsPath = path.resolve(userDataPath, 'user_backgrounds');

const readChunk = require('read-chunk');
const imageType = require('image-type');

const imagemin = require('imagemin');
const Noty = require('noty');

const slash = require('../../slash');

const { i18n, store } = remote.require('./app');
const analytics = remote.getGlobal('analytics');

const themeTypes = [
  { type: 'COLOR', title: 'COLORS' },
  { type: 'BACKGROUND', title: 'BACKGROUNDS' },
  { type: 'SPECIAL', title: 'SPECIAL_CONDITIONS' },
];

const uploadErrorNotification = (message, timeout = 3000) => {
  new Noty({
    type: 'error',
    text: message,
    timeout,
    modal: true,
  }).show();
};

const toggleRecentBgHeader = () => {
  const customBgExists = document.querySelector('.custom-bg:not(.delete-animate)');
  const recentBgHeader = document.querySelector('.recentbg-header');
  recentBgHeader.classList.toggle('hidden', !customBgExists);
};

const toggleFileInput = (showError = false) => {
  const isLimitReached = document.querySelectorAll('.custom-bg:not(.delete-animate)').length > 4;
  document.querySelector('.file-input-label').classList.toggle('disabled', isLimitReached);
  document.querySelector('#themebg-upload').disabled = isLimitReached;
  if (isLimitReached && showError) {
    uploadErrorNotification(i18n.t('THEMES.LIMIT_ERR'), 5000);
  }
};

const ThemeContainer = () => {
  const { theme: currentTheme } = useStoreState(state => state.userSettings);
  const { setTheme } = useStoreActions(state => state.userSettings);

  const applyTheme = (themeInstance, isCustom) => {
    setTheme(themeInstance.key);
    if (!isCustom) {
      /* TODO: move this to react state when porting viewer to react */
      store.setUserPref('app.themebg', {
        type: 'default',
        url: `assets/img/custom_backgrounds/${themeInstance['background-image-full']}`,
      });
    }
    global.core.platformMethod('updateSettings');
    analytics.trackEvent('theme', themeInstance.key);
  };

  // const imageInput = themesContainer =>
  //   h(
  //     'label.file-input-label',
  //     {
  //       for: 'themebg-upload',
  //       onclick: () => {
  //         toggleFileInput(true);
  //       },
  //     },
  //     'New Image',
  //     h('input.file-input#themebg-upload', {
  //       type: 'file',
  //       onchange: async evt => {
  //         store.setUserPref('app.theme', themesWithCustomBg[0]);

  //         try {
  //           if (!fs.existsSync(userBackgroundsPath)) await mkdir(userBackgroundsPath);
  //         } catch (error) {
  //           uploadErrorNotification(i18n.t('THEMES.DIR_CREATE_ERR2'));
  //         }

  //         try {
  //           const filePath = evt.target.files[0].path;

  //           // eslint-disable-next-line no-param-reassign
  //           evt.target.value = '';

  //           if (imageCheck(filePath)) {
  //             const files = await imagemin([filePath], userBackgroundsPath);
  //             if (files) {
  //               store.setUserPref('app.themebg', {
  //                 type: 'custom',
  //                 url: `${files[0].path}`.replace(/(\s)/g, '\\ '),
  //               });
  //               upsertCustomBackgrounds(themesContainer);

  //               analytics.trackEvent('theme', 'custom');
  //               global.core.platformMethod('updateSettings');
  //             }
  //           } else {
  //             throw new Error(i18n.t('THEMES.ALLOWED_IMGS_MSG'));
  //           }
  //         } catch (error) {
  //           uploadErrorNotification(i18n.t('THEMES.USING_ERR'), 5000);
  //         }
  //       },
  //     }),
  //   );
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
        return (
          acceptedExtensions.includes(fileMeta.ext) && acceptedMimeTypes.includes(fileMeta.mime)
        );
      }
    } catch (error) {
      uploadErrorNotification(i18n.t('THEMES.FILE_VALIDATE_ERR', { error }));
    }

    return false;
  };

  const recentSwatchFactory = backgroundPath =>
    h(
      'li.theme-instance.custom-bg.visible',
      {
        style: {
          'background-image': `url(${slash(backgroundPath.replace(/(\s)/g, '\\ '))})`,
        },
        onclick: () => {
          store.setUserPref('app.theme', themesWithCustomBg[0]);
          store.setUserPref('app.themebg', {
            type: 'custom',
            url: backgroundPath.replace(/(\s)/g, '\\ '),
          });
          global.core.platformMethod('updateSettings');
        },
      },
      h(
        'button.delete-btn',
        {
          onclick: evt => {
            evt.stopPropagation();
            const currentBg = store.getUserPref('app.themebg');
            if (currentBg.url === backgroundPath.replace(/(\s)/g, '\\ ')) {
              uploadErrorNotification(i18n.t('THEMES.DELETE_ERR'), 5000);
            } else {
              fs.unlink(backgroundPath, error => {
                if (error) {
                  uploadErrorNotification(i18n.t('THEMES.DELETE_ERR', { error }));
                } else {
                  evt.target.closest('.custom-bg').classList.add('delete-animate');
                  toggleRecentBgHeader();
                  toggleFileInput();
                }
              });
            }
          },
        },
        h('i.fa.fa-trash-o'),
      ),
    );

  const upsertCustomBackgrounds = themesContainer => {
    const recentBgsContainer =
      document.querySelector('.recentbgs-container') ||
      themesContainer.appendChild(h('ul.recentbgs-container'));
    recentBgsContainer.innerHTML = '';

    try {
      if (!fs.existsSync(userBackgroundsPath)) mkdir(userBackgroundsPath);
    } catch (error) {
      uploadErrorNotification(i18n.t('THEMES.DIR_CREATE_ERR', { error }));
    }

    fs.readdir(userBackgroundsPath, (error, files) => {
      if (error) {
        uploadErrorNotification(i18n.t('THEMES.UNABLE_TO_GET', { error }));
      } else {
        const sortedFiles = files
          .map(fileName => ({
            name: fileName,
            time: fs.statSync(path.resolve(userBackgroundsPath, fileName)).mtime.getTime(),
          }))
          .sort((a, b) => b.time - a.time)
          .map(v => v.name);

        sortedFiles.forEach(file => {
          const fullPath = path.resolve(userBackgroundsPath, file);
          if (imageCheck(fullPath)) {
            recentBgsContainer.appendChild(recentSwatchFactory(fullPath));
          } else {
            fs.unlink(fullPath, deleteError => {
              if (deleteError)
                uploadErrorNotification(i18n.t('THEMES.UNABLE_TO_DEL', { deleteError }));
            });
          }
        });
      }
      toggleRecentBgHeader();
      toggleFileInput();
    });
  };

  const uploadImage = async evt => {
    store.setUserPref('app.theme', themesWithCustomBg[0]);

    try {
      if (!fs.existsSync(userBackgroundsPath)) await mkdir(userBackgroundsPath);
    } catch (error) {
      uploadErrorNotification(i18n.t('THEMES.DIR_CREATE_ERR2'));
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
          upsertCustomBackgrounds(themesContainer);

          analytics.trackEvent('theme', 'custom');
          global.core.platformMethod('updateSettings');
        }
      } else {
        throw new Error(i18n.t('THEMES.ALLOWED_IMGS_MSG'));
      }
    } catch (error) {
      uploadErrorNotification(i18n.t('THEMES.USING_ERR'), 5000);
    }
  };

  const groupThemes = themeType => themes.filter(({ type }) => type.includes(themeType));

  return (
    <div className="settings-container themes-container">
      <div id="custom-theme-options">
        {themeTypes.map(({ type, title }) => (
          <React.Fragment key={type}>
            <header className="options-header">{i18n.t(`THEMES.${title}`)}</header>
            {groupThemes(type).map(theme => (
              <Tile
                key={theme.name}
                onClick={() => {
                  if (currentTheme !== theme.key) {
                    applyTheme(theme);
                  }
                }}
                className="theme-instance"
                theme={theme}
              >
                {i18n.t(`THEMES.${theme.name}`)}
              </Tile>
            ))}
          </React.Fragment>
        ))}
        <header className="options-header">{i18n.t(`THEMES.CUSTOM_BACKGROUNDS`)}</header>
        <label className="file-input-label">
          {i18n.t(`THEMES.NEW_IMAGE`)}
          <input className="file-input" onChange={uploadImage} id="themebg-upload" type="file" />
        </label>
        <p className="helper-text">{i18n.t('THEMES.RECOMMENDED')}</p>
      </div>
    </div>
  );
};

ThemeContainer.propTypes = {};

export default ThemeContainer;
