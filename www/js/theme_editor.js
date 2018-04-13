const h = require('hyperscript');
const fs = require('fs');

const imagesPath = 'assets/custom_backgrounds';
const defaultImages = [];
fs.readdir(imagesPath, (err, images) => {
  images.forEach((image) => {
    defaultImages.push(image);
  });
});

const defaultTheme = {
  'background-color': '#ffffff',
  'gurbani-color': '#01579b',
  'translation-color': '#4e4e4e',
  'transliteration-color': '#666666',
  'teeka-color': '#5a5a5a',
};

let theme;
if (localStorage.getItem('customTheme')) {
  theme = JSON.parse(localStorage.getItem('customTheme'));
} else {
  theme = defaultTheme;
  localStorage.setItem('customTheme', JSON.stringify(theme));
}

const colorInputFactory = (inputName, defaultColor) => {
  const inputLabel = inputName.replace('-', ' ');
  return h(
    'li',
    [
      h(
        'label',
        {
          for: inputName,
        },
        inputLabel),
      h(
        `input#${inputName}`,
        {
          type: 'color',
          value: defaultColor,
          onchange: (event) => {
            theme[inputName] = event.target.value;
            localStorage.setItem('customTheme', JSON.stringify(theme));
            global.core.platformMethod('updateTheme');
          },
        }),
    ]);
};

const closeCustomTheme = h(
  'a.close-button',
  {
    onclick: () => {
      document.querySelector('#setting-app-custom-theme-options-show-theme-editor').click();
    } },
  h('i.fa.fa-times'));

module.exports = {
  defaultTheme,
  init() {
    const customThemeOptions = document.querySelector('#custom-theme-options');
    document.querySelector('#options-page-close').appendChild(closeCustomTheme);
    Object.keys(theme).forEach((themeParam) => {
      customThemeOptions.appendChild(colorInputFactory(themeParam, theme[themeParam]));
    });
  },
};
