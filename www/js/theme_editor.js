const h = require('hyperscript');
// const fs = require('fs');
const Noty = require('noty');
const customThemes = require('./themes.json');

// const imagesPath = 'assets/custom_backgrounds';

const defaultTheme = customThemes[0];

/* defaultTheme.bgImage = '';
const getCurrentTheme = () => {
  const currentThemeString = localStorage.getItem('customTheme');
  if (currentThemeString) {
    try {
      return JSON.parse(currentThemeString);
    } catch (error) {
      new Noty({
        type: 'error',
        text: `There is an error reading current theme.
        Try checking theme file for errors. If error persists,
        report it at www.sttm.co`,
        timeout: 3000,
        modal: true,
      }).show();
      return defaultTheme;
    }
  }
  return defaultTheme;
}; */

const closeCustomTheme = h(
  'a.close-button',
  {
    onclick: () => {
      document.querySelector('#setting-app-custom-theme-options-show-theme-editor').click();
    },
  },
  h('i.fa.fa-times'));

const swatchFactory = themeInstance =>
  h(
    'li.theme-instance',
    {
      style: {
        'background-color': themeInstance['background-color'],
        'background-image': `url(../assets/custom_backgrounds/${themeInstance['background-image']})`,
      },
      onclick: () => {
        // const newTheme = themeInstance;
        // newTheme.bgImage = getCurrentTheme().bgImage;
        try {
          localStorage.setItem('customTheme', JSON.stringify(themeInstance));
          global.core.platformMethod('updateTheme');
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

/*
const bgTileFactory = (bgImage) => {
  const bgImageUrl = bgImage ? `url(../${imagesPath}/${bgImage})` : '';
  return h(
    'li.theme-instance',
    {
      style: {
        'background-image': bgImageUrl,
      },
      onclick: () => {
        const currentTheme = getCurrentTheme();
        currentTheme.bgImage = bgImage;
        try {
          localStorage.setItem('customTheme', JSON.stringify(currentTheme));
          global.core.platformMethod('updateTheme');
        } catch (error) {
          new Noty({
            type: 'error',
            text: `There is an error adding this background to current theme.
            Try checking themes.json for errors. If error persists,
            report it at www.sttm.co`,
            timeout: 3000,
            modal: true,
          }).show();
        }
      },
    },
  );
};
*/
const swatchHeaderFactory = headerText => h('header.options-header', headerText);

module.exports = {
  defaultTheme,
  init() {
    const customThemeOptions = document.querySelector('#custom-theme-options');
    document.querySelector('#options-page-close').appendChild(closeCustomTheme);

    customThemeOptions.appendChild(swatchHeaderFactory('Custom Themes'));
    customThemes.forEach((themeInstance) => {
      customThemeOptions.appendChild(swatchFactory(themeInstance));
    });

    /* customThemeOptions.appendChild(swatchHeaderFactory('Custom Backgrounds'));
    // customThemeOptions.appendChild(bgTileFactory(''));
    fs.readdir(imagesPath, (err, images) => {
      images.forEach((image) => {
        customThemeOptions.appendChild(bgTileFactory(image));
      });
    }); */
  },
};
