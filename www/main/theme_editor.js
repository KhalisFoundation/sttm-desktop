const h = require('hyperscript');
const Noty = require('noty');
const { remote } = require('electron');

const analytics = remote.getGlobal('analytics');

const { store, themes, i18n } = remote.require('./app');

const defaultTheme = themes[0];

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

/*
 * DOM Factories
 */

const getThemeSwatchStyles = themeInstance => {
  return {
    'background-color': themeInstance['background-color'],
    'background-image': themeInstance['background-image']
      ? `url(assets/img/custom_backgrounds/${themeInstance['background-image']})`
      : 'none',
  };
};

const applyTheme = (themeInstance, isCustom) => {
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
    uploadErrorNotification(i18n.t('THEMES.PARSE_ERR', { error }), 5000);
  }
};

const swatchFactory = (themeInstance, isCustom, forceLabel = null) =>
  h(
    'li.theme-instance',
    {
      style: getThemeSwatchStyles(themeInstance),
      onclick: () => {
        applyTheme(themeInstance, isCustom);
      },
    },
    h(
      `span.theme-text.${themeInstance.name}`,
      {
        style: {
          color: themeInstance['gurbani-color'],
        },
      },
      forceLabel || i18n.t(`THEMES.${themeInstance.name}`),
    ),
  );

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
    anandKarajPane.appendChild(swatchFactory(currentTheme, false, i18n.t('THEMES.CURRENT_THEME')));
  }
};

const getTheme = themeKey => themes.find(theme => theme.key === themeKey);
const getCurrentTheme = () => getTheme(store.getUserPref('app.theme'));

module.exports = {
  themes,
  defaultTheme,
  updateCeremonyThemeTiles,
  getCurrentTheme,
  getTheme,
  applyTheme,
  init() {},
};
