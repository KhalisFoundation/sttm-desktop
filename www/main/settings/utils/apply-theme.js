import { remote } from 'electron';

const { store } = remote.require('./app');
const analytics = remote.getGlobal('analytics');

export const applyTheme = (themeInstance, isCustom, setTheme, setThemeBg) => {
  if (!isCustom) {
    setTheme(themeInstance.key);
    const hasBackgroundImage = !!themeInstance['background-image'];
    const imageUrl = hasBackgroundImage
      ? `assets/img/custom_backgrounds/${themeInstance['background-image-full']}`
      : false;
    const themeBgObj = {
      type: 'default',
      url: imageUrl,
    };
    setThemeBg(themeBgObj);
    /* TODO: move this to react state when porting viewer to react */
    store.setUserPref('app.themebg', themeBgObj);
  } else {
    const themeBgObj = {
      type: 'custom',
      url: themeInstance['background-image'],
    };
    setThemeBg(themeBgObj);
    store.setUserPref('app.themebg', themeBgObj);
  }
  global.core.platformMethod('updateSettings');
  analytics.trackEvent('theme', themeInstance.key);
};
