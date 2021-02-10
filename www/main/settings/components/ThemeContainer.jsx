import React from 'react';

import { remote } from 'electron';
import { Tile } from '../../common/sttm-ui';

import { themes } from '../../theme_editor';

import { useStoreActions, useStoreState } from 'easy-peasy';

const { i18n, store } = remote.require('./app');
const analytics = remote.getGlobal('analytics');

const themeTypes = [
  { type: 'COLOR', title: 'COLORS' },
  { type: 'BACKGROUND', title: 'BACKGROUNDS' },
  { type: 'SPECIAL', title: 'SPECIAL_CONDITIONS' },
];

const ThemeContainer = () => {
  const { theme: currentTheme } = useStoreState(state => state.userSettings);
  const { setTheme } = useStoreActions(state => state.userSettings);

  const applyTheme = (themeInstance, isCustom) => {
    setTheme(themeInstance.key);
    if (!isCustom) {
      /* TODO: move this to react state when porting viewer to react */
      store.setUserPref('app.themebg', {
        type: 'default',
        url: `assets/img/custom_backgrounds/${themeInstance['background-image-full']}`,
      });
    }
    global.core.platformMethod('updateSettings');
    analytics.trackEvent('theme', themeInstance.key);
  };

  const groupThemes = themeType => themes.filter(({ type }) => type.includes(themeType));

  return (
    <div className="settings-container">
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
          <input className="file-input" id="themebg-upload" type="file" />
        </label>
        <p className="helper-text">{i18n.t('THEMES.RECOMMENDED')}</p>
      </div>
    </div>
  );
};

ThemeContainer.propTypes = {};

export default ThemeContainer;
