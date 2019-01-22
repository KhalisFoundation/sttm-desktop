const h = require('hyperscript');
const Noty = require('noty');
const fs = require('fs');
const path = require('path');
const util = require('util');
const imagemin = require('imagemin');
const { remote } = require('electron');

const themes = require('./themes.json');

const mkdir = util.promisify(fs.mkdir);
const userDataPath = remote.app.getPath('userData');
const userBackgroundsPath = path.resolve(userDataPath, 'user_backgrounds');

const { store, analytics } = remote.require('./app');

const defaultTheme = themes[0];

const themesWithCustomBg = themes
                            .filter(theme => theme.type === 'COLOR' || theme.type === 'SPECIAL')
                            .map(theme => theme.key);

const uploadErrorNotification = (message) => {
  new Noty({
    type: 'error',
    text: message,
    timeout: 3000,
    modal: true,
  }).show();
};

const recentSwatchFactory = backgroundPath =>
  h(
    'li.theme-instance.custom-bg',
    {
      style: {
        'background-image': `url(${backgroundPath.replace(/(\s)/g, '\\ ')})`,
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
        onclick: (evt) => {
          evt.stopPropagation();
          fs.unlink(backgroundPath, (error) => {
            if (error) {
              uploadErrorNotification(`Unable to delete that image. Press cmd+r / ctrl+r to refresh. - ${error}`);
            } else {
              evt.target.parentNode.parentNode.classList.add('delete-animate');
            }
          });
        },
      },
      h('i.fa.fa-trash-o'),
    ),
  );


const swatchFactory = (themeInstance, isCustom) =>
  h(
    'li.theme-instance',
    {
      style: {
        'background-color': themeInstance['background-color'],
        'background-image': themeInstance['background-image'] ? `url(assets/img/custom_backgrounds/${themeInstance['background-image']})` : 'none',
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
        } catch (error) {
          new Noty({
            type: 'error',
            text: `There is an error parsing this theme.
            Try checking theme file for errors. If error persists,
            report it at www.sttm.co`,
            timeout: 3000,
            modal: true,
          }).show();
        }
      },
    },
    h(
      `span.${themeInstance.name}`,
      {
        style: {
          color: themeInstance['gurbani-color'],
        },
      },
      themeInstance.name));

const swatchHeaderFactory = headerText => h('header.options-header', headerText);

const imageInput = themesContainer =>
  h(
    'label.file-input-label',
    {
      for: 'themebg-upload',
    },
    'Choose a file',
    h('input.file-input#themebg-upload',
      {
        type: 'file',
        accept: 'image/x-png, image/jpeg',
        onchange: async (evt) => {
          // const curTheme = store.getUserPref('app.theme');

          // if (!themesWithCustomBg.includes(curTheme)) {
          store.setUserPref('app.theme', themesWithCustomBg[0]);
          // }


          try {
            if (!fs.existsSync(userBackgroundsPath)) await mkdir(userBackgroundsPath);
          } catch (error) {
            uploadErrorNotification(`There was an error using this image. If error persists, report it at www.sttm.co: Error Creating Directory - ${error}`);
          }

          try {
            const files = await imagemin([evt.target.files[0].path], userBackgroundsPath);
            if (files) {
              store.setUserPref('app.themebg', {
                type: 'custom',
                url: `${files[0].path}`.replace(/(\s)/g, '\\ '),
              });
              themesContainer.appendChild(recentSwatchFactory(files[0].path));
              analytics.trackEvent('theme', 'custom');
              global.core.platformMethod('updateSettings');
            }
          } catch (error) {
            uploadErrorNotification(`There was an error using this image. If error persists, report it at www.sttm.co: ${error}`);
          }
        },
      },
    ),
  );

const swatchGroupFactory = (themeType, themesContainer, isCustom) => {
  themes.forEach((themeInstance) => {
    if (themeInstance.type === themeType) {
      themesContainer.appendChild(swatchFactory(themeInstance, isCustom));
    }
  });
};

const upsertCustomBackgrounds = (themesContainer) => {
  document.querySelectorAll('.custom-bg').forEach((swatch) => {
    swatch.remove();
  });
  fs.readdir(userBackgroundsPath, (error, files) => {
    if (error) {
      uploadErrorNotification(`Unable to get existing custom background files - ${error}`);
    } else {
      files.forEach((file) => {
        const acceptedExtensions = ['.png', '.PNG', '.jpg', '.JPG', '.jpeg', '.JPEG'];
        const extension = path.extname(file);

        if (acceptedExtensions.includes(extension)) {
          themesContainer.appendChild(recentSwatchFactory(path.resolve(userBackgroundsPath, file)));
        }
      });
    }
  });
};

module.exports = {
  defaultTheme,
  init() {
    const themeOptions = document.querySelector('#custom-theme-options');

    themeOptions.appendChild(swatchHeaderFactory('Colours'));
    swatchGroupFactory('COLOR', themeOptions);

    themeOptions.appendChild(swatchHeaderFactory('Backgrounds'));
    swatchGroupFactory('BACKGROUND', themeOptions);

    themeOptions.appendChild(swatchHeaderFactory('Special Conditions'));
    swatchGroupFactory('SPECIAL', themeOptions);

    themeOptions.appendChild(swatchHeaderFactory('New Custom background'));
    themeOptions.appendChild(imageInput(themeOptions));

    themeOptions.appendChild(swatchHeaderFactory('Recent custom backgrounds'));
    upsertCustomBackgrounds(themeOptions);


    /* themeOptions.appendChild(swatchHeaderFactory('Custom background themes'));
    swatchGroupFactory('COLOR', themeOptions, true);
    swatchGroupFactory('SPECIAL', themeOptions, true); */
  },
};
