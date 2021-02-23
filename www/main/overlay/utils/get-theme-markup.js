import React from 'react';

const electron = require('electron');

const { remote } = electron;
const { i18n } = remote.require('./app');

const getThemeMarkup = themeObjects =>
  Object.keys(themeObjects).map(theme => {
    const currentTheme = themeObjects[theme];
    const themeClass = i18n
      .t(`THEMES.${currentTheme.label}`)
      .toLowerCase()
      .split(' ')
      .join('-');

    return (
      <div
        key={`theme-${theme}`}
        className={`overlay-theme-swatch ${themeClass}`}
        style={{
          color: currentTheme.gurbaniTextColor,
          background: currentTheme.bgColor,
        }}
      >
        <span>{i18n.t(`THEMES.${currentTheme.label}`)}</span>
      </div>
    );
  });

export default getThemeMarkup;
