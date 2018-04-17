const h = require('hyperscript');
const fs = require('fs');
const customThemes = require('./themes.json');

const imagesPath = 'assets/custom_backgrounds';

const defaultTheme = customThemes[0];
defaultTheme.bgImage = '';

const getCurrentTheme = () => {
  const currentThemeString = localStorage.getItem('customTheme');
  if (currentThemeString) {
    return JSON.parse(currentThemeString);
  }
  return defaultTheme;
};

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
      },
      onclick: () => {
        const newTheme = themeInstance;
        newTheme.bgImage = getCurrentTheme().bgImage;
        localStorage.setItem('customTheme', JSON.stringify(newTheme));
        global.core.platformMethod('updateTheme');
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

const bgTileFactory = bgImage =>
   h(
     'li.theme-instance',
     {
       style: {
         'background-image': `url(../${imagesPath}/${bgImage})`,
       },
       onclick: () => {
         const currentTheme = getCurrentTheme();
         currentTheme.bgImage = bgImage;
         localStorage.setItem('customTheme', JSON.stringify(currentTheme));
         global.core.platformMethod('updateTheme');
       },
     },
    );

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

    customThemeOptions.appendChild(swatchHeaderFactory('Custom Backgrounds'));
    customThemeOptions.appendChild(bgTileFactory(''));
    fs.readdir(imagesPath, (err, images) => {
      images.forEach((image) => {
        customThemeOptions.appendChild(bgTileFactory(image));
      });
    });
  },
};
