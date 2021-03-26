import React from 'react';

import { remote } from 'electron';
import { useStoreActions, useStoreState } from 'easy-peasy';
import { Tile } from '../../common/sttm-ui';

import { themes } from '../../theme_editor';
import { uploadImage } from '../utils';

// const path = require('path');

// const userDataPath = remote.app.getPath('userData');
// const userBackgroundsPath = path.resolve(userDataPath, 'user_backgrounds');
const { i18n, store } = remote.require('./app');
const analytics = remote.getGlobal('analytics');

const themeTypes = [
  { type: 'COLOR', title: 'COLORS' },
  { type: 'BACKGROUND', title: 'BACKGROUNDS' },
  { type: 'SPECIAL', title: 'SPECIAL_CONDITIONS' },
];

const ThemeContainer = () => {
  const { theme: currentTheme } = useStoreState(state => state.userSettings);
  const { setTheme, setThemeBg } = useStoreActions(state => state.userSettings);

  const applyTheme = (themeInstance, isCustom) => {
    // console.log("applying theme now");
    setTheme(themeInstance.key);
    if (!isCustom) {
      // console.log("theme is not custom");
      const hasBackgroundImage = !!themeInstance['background-image'];
      // console.log("does them have bg image?", hasBackgroundImage);
      console.log(hasBackgroundImage);
      const imageUrl = hasBackgroundImage
        ? `assets/img/custom_backgrounds/${themeInstance['background-image-full']}`
        : false;
      // console.log("image url is", imageUrl);
      const themeBgObj = {
        type: 'default',
        url: imageUrl,
      };
      setThemeBg(themeBgObj);
      /* TODO: move this to react state when porting viewer to react */
      store.setUserPref('app.themebg', themeBgObj);
      // console.log("state object for themebg is", themeBgObj);
    }
    global.core.platformMethod('updateSettings');
    analytics.trackEvent('theme', themeInstance.key);
  };

  const groupThemes = themeType => themes.filter(({ type }) => type.includes(themeType));

  return (
    <div className="settings-container themes-container">
      <div id="custom-theme-options">
        {themeTypes.map(({ type, title }) => (
          <React.Fragment key={type}>
            <header className="options-header">{i18n.t(`THEMES.${title}`)}</header>
            {groupThemes(type).map(theme => (
              <Tile
                key={theme.name}
                onClick={() => {
                  if (currentTheme !== theme.key) {
                    applyTheme(theme);
                  }
                }}
                className="theme-instance"
                theme={theme}
              >
                {i18n.t(`THEMES.${theme.name}`)}
              </Tile>
            ))}
          </React.Fragment>
        ))}
        <header className="options-header">{i18n.t(`THEMES.CUSTOM_BACKGROUNDS`)}</header>
        <label className="file-input-label">
          New Image
          <input className="file-input" onChange={uploadImage} id="themebg-upload" type="file" />
        </label>
        <p className="helper-text">{i18n.t('THEMES.RECOMMENDED')}</p>
      </div>
    </div>
  );
};

ThemeContainer.propTypes = {};

export default ThemeContainer;
