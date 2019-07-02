const h = require('hyperscript');
const Noty = require('noty');
const fs = require('fs');
const path = require('path');
const util = require('util');
const imagemin = require('imagemin');
const { remote } = require('electron');
const readChunk = require('read-chunk');
const imageType = require('image-type');

const themes = require('./themes.json');
const slash = require('./slash');

const analytics = remote.getGlobal('analytics');

const mkdir = util.promisify(fs.mkdir);
const userDataPath = remote.app.getPath('userData');
const userBackgroundsPath = path.resolve(userDataPath, 'user_backgrounds');

const { store } = remote.require('./app');

const defaultTheme = themes[0];

const themesWithCustomBg = themes
  .filter(theme => theme.type === 'COLOR' || theme.type === 'SPECIAL')
  .map(theme => theme.key);

/*
 * Helper Functions
 */

const uploadErrorNotification = (message, timeout = 3000) => {
  new Noty({
    type: 'error',
    text: message,
    timeout,
    modal: true,
  }).show();
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
    uploadErrorNotification(`Failed to validate this file as an image.
      Error: ${error}. If error presists file a bug report at sttm.co`);
  }

  return false;
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
    uploadErrorNotification(
      'Five custom backgrounds limit reached. Please delete one or more before adding another custom background.',
      5000,
    );
  }
};

/*
 * DOM Factories
 */

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
            uploadErrorNotification(
              'This image is being used, please switch to another image or theme before deleting this image.',
              5000,
            );
          } else {
            fs.unlink(backgroundPath, error => {
              if (error) {
                uploadErrorNotification(`Unable to delete that image. - ${error}`);
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

const swatchFactory = (themeInstance, isCustom, forceLabel = null) =>
  h(
    'li.theme-instance',
    {
      style: {
        'background-color': themeInstance['background-color'],
        'background-image': themeInstance['background-image']
          ? `url(assets/img/custom_backgrounds/${themeInstance['background-image']})`
          : 'none',
      },
      onclick: () => {
        try {
          document.body.classList.remove(store.getUserPref('app.theme'));
          store.setUserPref('app.theme', themeInstance.key);
          if (!isCustom) {
            store.setUserPref('app.themebg', {
              type: 'default',
              url: `assets/img/custom_backgrounds/${themeInstance['background-image-full']}`,
            });
          }
          document.body.classList.add(themeInstance.key);
          global.core.platformMethod('updateSettings');
          analytics.trackEvent('theme', themeInstance.key);
          // eslint-disable-next-line no-use-before-define
          updateCeremonyThemeTiles();
        } catch (error) {
          uploadErrorNotification(
            `There is an error parsing this theme.
            Try checking theme file for error. ${error} - If error persists,
            report it at www.sttm.co`,
            5000,
          );
        }
      },
    },
    h(
      `span.theme-text.${themeInstance.name}`,
      {
        style: {
          color: themeInstance['gurbani-color'],
        },
      },
      forceLabel || themeInstance.name,
    ),
  );

const swatchHeaderFactory = headerText => h('header.options-header', headerText);

const upsertCustomBackgrounds = themesContainer => {
  const recentBgsContainer =
    document.querySelector('.recentbgs-container') ||
    themesContainer.appendChild(h('ul.recentbgs-container'));
  recentBgsContainer.innerHTML = '';

  try {
    if (!fs.existsSync(userBackgroundsPath)) mkdir(userBackgroundsPath);
  } catch (error) {
    uploadErrorNotification(
      ` Error creating directory for user backgrounds. ${error} - If error persists, report it at www.sttm.co:`,
    );
  }

  fs.readdir(userBackgroundsPath, (error, files) => {
    if (error) {
      uploadErrorNotification(`Unable to get existing custom background files - ${error}`);
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
            if (deleteError) uploadErrorNotification(`Unable to delete a file. - ${deleteError}`);
          });
        }
      });
    }
    toggleRecentBgHeader();
    toggleFileInput();
  });
};

const swatchGroupFactory = (themeType, themesContainer, isCustom) => {
  themes.forEach(themeInstance => {
    let themeTypeMatches = false;
    if (Array.isArray(themeInstance.type)) {
      themeTypeMatches = themeInstance.type.includes(themeType);
    } else {
      themeTypeMatches = themeInstance.type === themeType;
    }
    if (themeTypeMatches) {
      themesContainer.appendChild(swatchFactory(themeInstance, isCustom));
    }
  });
};

const updateCeremonyThemeTiles = () => {
  const currentTheme = themes.find(theme => theme.key === store.getUserPref('app.theme'));
  document.querySelectorAll('.ceremony-pane-themes .theme-instance').forEach(el => el.remove());

  const anandKarajPane = document.querySelector('.ceremony-pane-themes#anandkaraj');
  if (anandKarajPane) {
    swatchGroupFactory('anandkaraj', anandKarajPane);
    anandKarajPane.appendChild(swatchFactory(currentTheme, false, 'Current Theme'));
  }
};

const imageInput = themesContainer =>
  h(
    'label.file-input-label',
    {
      for: 'themebg-upload',
      onclick: () => {
        toggleFileInput(true);
      },
    },
    'New Image',
    h('input.file-input#themebg-upload', {
      type: 'file',
      onchange: async evt => {
        store.setUserPref('app.theme', themesWithCustomBg[0]);

        try {
          if (!fs.existsSync(userBackgroundsPath)) await mkdir(userBackgroundsPath);
        } catch (error) {
          uploadErrorNotification(
            `Error Creating Directory. ${error} - If error persists, report it at www.sttm.co:`,
          );
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
            throw new Error('Only .png and .jpg images are allowed.');
          }
        } catch (error) {
          uploadErrorNotification(
            `There was an error using this file. ${error} -
            If error persists, report it at www.sttm.co`,
            5000,
          );
        }
      },
    }),
  );

module.exports = {
  defaultTheme,
  updateCeremonyThemeTiles,
  init() {
    const themeOptions = document.querySelector('#custom-theme-options');

    themeOptions.appendChild(swatchHeaderFactory('Colours'));
    swatchGroupFactory('COLOR', themeOptions);

    themeOptions.appendChild(swatchHeaderFactory('Backgrounds'));
    swatchGroupFactory('BACKGROUND', themeOptions);

    themeOptions.appendChild(swatchHeaderFactory('Special Conditions'));
    swatchGroupFactory('SPECIAL', themeOptions);

    themeOptions.appendChild(swatchHeaderFactory('Custom backgrounds'));
    themeOptions.appendChild(imageInput(themeOptions));
    themeOptions.appendChild(h('p.helper-text', 'Recommended 1920x1080'));

    const recentBgHeader = themeOptions.appendChild(
      swatchHeaderFactory('Recent Custom backgrounds'),
    );
    recentBgHeader.classList.add('recentbg-header');
    upsertCustomBackgrounds(themeOptions);
  },
};
