import React, { useEffect, useState } from 'react';
import { useStoreActions, useStoreState } from 'easy-peasy';
import { Tile, CustomBgTile, VideoWithOverlay } from '../../common/sttm-ui';

import { themes } from '../../theme_editor';
import {
  applyTheme,
  uploadImage,
  setDefaultBg,
  upsertCustomBackgrounds,
  removeCustomBackgroundFile,
} from '../utils';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const themeTypes = [
  { type: 'COLOR', title: 'COLORS' },
  { type: 'BACKGROUND', title: 'BACKGROUNDS' },
  { type: 'SPECIAL', title: 'SPECIAL_CONDITIONS' },
  { type: 'VIDEO', title: 'VIDEOS' },
];

const ThemeContainer = () => {
  const [customThemes, setCustomThemes] = useState([]);
  const { setTheme, setThemeBg } = useStoreActions((state) => state.userSettings);
  const { theme: currentTheme, themeBg } = useStoreState((state) => state.userSettings);
  const groupThemes = (themeType) => themes.filter(({ type }) => type.includes(themeType));

  useEffect(() => {
    upsertCustomBackgrounds(setCustomThemes);
  }, []);

  return (
    <div className="settings-container themes-container">
      <div id="custom-theme-options">
        {themeTypes.map(({ type, title }) => (
          <React.Fragment key={type}>
            <header className="options-header">
              {i18n.t(`THEMES.${title}`)}
              {type === 'VIDEO' && (
                <span className="notes">{i18n.t('SETTINGS.CHROMECAST_UNAVAILABLE')}</span>
              )}
            </header>
            <span className="theme-tile-holder">
              {groupThemes(type).map((theme) => (
                <Tile
                  key={theme.name}
                  onClick={() => {
                    if (currentTheme !== theme.key) {
                      applyTheme(theme, false, setTheme, setThemeBg, themeBg);
                    }
                    setDefaultBg(theme, setThemeBg, themeBg);
                  }}
                  className={theme['background-video'] ? 'video-theme-instance' : 'theme-instance'}
                  theme={theme}
                >
                  {theme['background-video'] ? (
                    <VideoWithOverlay
                      src={theme['background-video']}
                      overlayContent={i18n.t(`THEMES.${theme.name}`)}
                    />
                  ) : (
                    i18n.t(`THEMES.${theme.name}`)
                  )}
                </Tile>
              ))}
            </span>
          </React.Fragment>
        ))}

        <header className="options-header">{i18n.t(`THEMES.CUSTOM_BACKGROUNDS`)}</header>
        <label className="file-input-label">
          {i18n.t('THEMES.NEW_IMAGE')}
          <input
            className="file-input"
            onChange={async (e) => {
              await uploadImage(e);
              upsertCustomBackgrounds(setCustomThemes);
            }}
            id="themebg-upload"
            type="file"
            accept="image/png, image/jpeg"
          />
        </label>
        <p className="helper-text">{i18n.t('THEMES.RECOMMENDED')}</p>
        <span className="theme-tile-holder">
          {customThemes.map((tile) => (
            <React.Fragment key={tile.name}>
              <CustomBgTile
                customBg={tile}
                onApply={() => {
                  applyTheme(tile, 'custom', setTheme, setThemeBg);
                }}
                onRemove={() => {
                  removeCustomBackgroundFile(tile['background-image-path']);
                  upsertCustomBackgrounds(setCustomThemes);
                  if (tile['background-image'] === themeBg.url.href) {
                    const currentThemeInstance = themes.filter(
                      (theme) => theme.key === currentTheme,
                    );
                    setDefaultBg(currentThemeInstance, setThemeBg, themeBg);
                  }
                }}
              />
            </React.Fragment>
          ))}
        </span>
      </div>
    </div>
  );
};

ThemeContainer.propTypes = {};

export default ThemeContainer;
