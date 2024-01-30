const remote = require('@electron/remote');

const analytics = remote.getGlobal('analytics');

export const setDefaultBg = (themeInstance, setThemeBg, themeBg) => {
  const hasBackgroundImage = !!themeInstance['background-image'];
  const hasBackgroundVideo = !!themeInstance['background-video'];
  const imageUrl = hasBackgroundImage
    ? `assets/img/custom_backgrounds/${themeInstance['background-image-full']}`
    : false;
  const videoUrl = hasBackgroundVideo ? themeInstance['background-video'] : false;

  const themeBgObj = {
    type: hasBackgroundVideo ? 'video' : 'default',
    url: hasBackgroundVideo ? videoUrl : imageUrl,
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
  analytics.trackEvent({
    category: 'theme',
    action: 'apply-theme',
    label: isCustom ? 'custom' : 'default',
    value: isCustom ? '' : themeInstance.key,
  });
};
