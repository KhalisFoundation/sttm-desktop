const h = require('hyperscript');
const Noty = require('noty');
const themes = require('./themes.json');

const { store, analytics } = require('electron').remote.require('./app');

const defaultTheme = themes[0];

const swatchFactory = themeInstance =>
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
          store.setUserPref('app.themebg', {
            type: 'default',
            url: `assets/img/custom_backgrounds/${themeInstance['background-image-full']}`,
          });
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

const imageInput = () =>
  h(
    'label.file-input-label',
    {
      for: 'themebg-upload',
    },
    'Choose a file',
    h('input.file-input#themebg-upload',
      {
        type: 'file',
        accept: 'image/*',
        onchange: (evt) => {
          store.setUserPref('app.themebg', {
            type: 'custom',
            url: evt.target.files[0].path,
          });
          global.core.platformMethod('updateSettings');
        },
      },
    ),
  );

module.exports = {
  defaultTheme,
  init() {
    const themeOptions = document.querySelector('#custom-theme-options');

    themeOptions.appendChild(swatchHeaderFactory('Colours'));

    themes.forEach((themeInstance) => {
      if (themeInstance.type === 'COLOR') {
        themeOptions.appendChild(swatchFactory(themeInstance));
      }
    });

    themeOptions.appendChild(swatchHeaderFactory('Backgrounds'));
    themes.forEach((themeInstance) => {
      if (themeInstance.type === 'BACKGROUND') {
        themeOptions.appendChild(swatchFactory(themeInstance));
      }
    });
    themeOptions.appendChild(swatchHeaderFactory('Special Conditions'));
    themes.forEach((themeInstance) => {
      if (themeInstance.type === 'SPECIAL') {
        themeOptions.appendChild(swatchFactory(themeInstance));
      }
    });

    themeOptions.appendChild(swatchHeaderFactory('Custom background'));
    themeOptions.appendChild(imageInput());
  },
};
