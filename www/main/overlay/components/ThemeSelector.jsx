import React from 'react';
import { useStoreActions, useStoreState } from 'easy-peasy';

import getThemeMarkup from '../utils/get-theme-markup';

const themeObjects = require('../../../configs/overlay_presets.json');

export const ThemeSelector = () => {
  const { setOverlayTheme } = useStoreActions(state => state.baniOverlay);
  const { overlayTheme } = useStoreState(state => state.baniOverlay);

  const handleThemeChange = e => {
    const clickedTheme = e.currentTarget.dataset.themeName;
    if (clickedTheme !== overlayTheme) {
      setOverlayTheme(clickedTheme);
    }
  };

  return (
    <section className="theme-selector">
      <p className="overlay-window-text theme-selector-header">Themes</p>
      {getThemeMarkup(themeObjects, handleThemeChange)}
    </section>
  );
};
