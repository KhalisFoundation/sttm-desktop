const remote = require('@electron/remote');

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
};

export const applyTheme = (themeInstance, isCustom, setTheme, setThemeBg, themeBg) => {
  if (!isCustom) {
    setTheme(themeInstance.key);
    setDefaultBg(themeInstance, setThemeBg, themeBg);
  } else {
    const themeBgObj = {
      type: 'custom',
      url: themeInstance['background-image'],
    };
    if (themeBg !== themeBgObj) {
      setThemeBg(themeBgObj);
    }
  }
  global.core.platformMethod('updateSettings');
  analytics.trackEvent('theme', themeInstance.key);
};
