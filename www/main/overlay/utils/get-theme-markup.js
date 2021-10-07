import React from 'react';
import convertToCamelCase from '../../common/utils/convert-to-camel-case';

const { remote } = require('electron');

const { i18n } = remote.require('./app');

const getThemeMarkup = (themeObjects, handleThemeChange) =>
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
        className={`overlay-theme-swatch`}
        data-theme-name={convertToCamelCase(themeClass)}
        style={{
          color: currentTheme.gurbaniTextColor,
          background: currentTheme.bgColor,
        }}
        onClick={handleThemeChange}
      >
        <span>{i18n.t(`THEMES.${currentTheme.label}`)}</span>
      </div>
    );
  });

export default getThemeMarkup;
