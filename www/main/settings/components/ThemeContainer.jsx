import React from 'react';

import { remote } from 'electron';
import { Tile } from '../../common/sttm-ui';

import { themes, applyTheme } from '../../theme_editor';

const { i18n } = remote.require('./app');

const themeTypes = [
  { type: 'COLOR', title: 'COLORS' },
  { type: 'BACKGROUND', title: 'BACKGROUNDS' },
  { type: 'SPECIAL', title: 'SPECIAL_CONDITIONS' },
];

const ThemeContainer = () => {
  const groupThemes = themeType => themes.filter(({ type }) => type.includes(themeType));
  return (
    <div className="block-list settings-theme">
      <div id="custom-theme-options">
        {themeTypes.map(({ type, title }) => (
          <React.Fragment key={type}>
            <header className="options-header">{i18n.t(`THEMES.${title}`)}</header>
            {groupThemes(type).map(theme => (
              <Tile
                key={theme.name}
                onClick={() => {
                  applyTheme(theme);
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
