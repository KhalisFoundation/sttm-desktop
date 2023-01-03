const remote = require('@electron/remote');

const { store } = remote.require('./app');
const analytics = remote.getGlobal('analytics');

export const setDefaultBg = (themeInstance, setThemeBg, themeBg) => {
  const hasBackgroundImage = !!themeInstance['background-image'];
  const imageUrl = hasBackgroundImage
    ? `assets/img/custom_backgrounds/${themeInstance['background-image-full']}`
    : false;
  const themeBgObj = {
    type: 'default',
    url: imageUrl,
  };
  if (themeBg !== themeBgObj) {
    setThemeBg(themeBgObj);
  }
  return themeBgObj;
};

export const applyTheme = (themeInstance, isCustom, setTheme, setThemeBg, themeBg) => {
  if (!isCustom) {
    setTheme(themeInstance.key);
    const themeBgObj = setDefaultBg(themeInstance, setThemeBg, themeBg);
    /* TODO: move this to react state when porting viewer to react */
    store.setUserPref('app.themebg', themeBgObj);
  } else {
    const themeBgObj = {
      type: 'custom',
      url: themeInstance['background-image'],
    };
    if (themeBg !== themeBgObj) {
      setThemeBg(themeBgObj);
    }
    store.setUserPref('app.themebg', themeBgObj);
  }
  global.core.platformMethod('updateSettings');
  analytics.trackEvent('theme', themeInstance.key);
};
