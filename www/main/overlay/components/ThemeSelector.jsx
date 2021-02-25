import React from 'react';

import getThemeMarkup from '../utils/get-theme-markup';

const themeObjects = require('../../../configs/overlay_presets.json');

export const ThemeSelector = () => {
  return (
    <section className="theme-selector">
      <p className="overlay-window-text theme-selector-header">Themes</p>
      {getThemeMarkup(themeObjects)}
    </section>
  );
};
