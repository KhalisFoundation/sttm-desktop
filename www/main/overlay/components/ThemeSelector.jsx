import React from 'react';
import { useStoreActions, useStoreState } from 'easy-peasy';

import getThemeMarkup from '../utils/get-theme-markup';

const themeObjects = require('../../../configs/overlay_presets.json');

export const ThemeSelector = () => {
  const { setOverlayTheme, setTextColor, setBgColor, setGurbaniTextColor } = useStoreActions(
    state => state.baniOverlay,
  );
  const { overlayTheme, gurbaniTextColor, textColor, bgColor } = useStoreState(
    state => state.baniOverlay,
  );
  const handleThemeChange = e => {
    const clickedTheme = e.currentTarget.dataset.themeName;
    const clickedThemeObj = themeObjects[clickedTheme];
    if (clickedTheme !== overlayTheme) {
      setOverlayTheme(clickedTheme);
      if (clickedThemeObj.textColor !== textColor) {
        setTextColor(clickedThemeObj.textColor);
      }
      if (clickedThemeObj.gurbaniTextColor !== gurbaniTextColor) {
        setGurbaniTextColor(clickedThemeObj.gurbaniTextColor);
      }
      if (clickedThemeObj.bgColor !== bgColor) {
        setBgColor(clickedThemeObj.bgColor);
      }
    }
  };

  return (
    <section className="theme-selector">
      <p className="overlay-window-text theme-selector-header">Themes</p>
      {getThemeMarkup(themeObjects, handleThemeChange)}
    </section>
  );
};
