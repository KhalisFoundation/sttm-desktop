import React, { useEffect } from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

import getThemeMarkup from '../utils/get-theme-markup';

const { ipcRenderer } = require('electron');
const themeObjects = require('../../../configs/overlay_presets.json');

export const ThemeSelector = () => {
  const { setTheme, setGurbaniTextColor, setTextColor, setBgColor } = useStoreActions(
    state => state.baniOverlay,
  );
  const baniOverlayState = useStoreState(state => state.baniOverlay);

  const handleThemeChange = e => {
    const clickedTheme = e.currentTarget.dataset.themeName;
    const { gurbaniTextColor, textColor, bgColor } = themeObjects[clickedTheme];
    setTheme(clickedTheme);
    setGurbaniTextColor(gurbaniTextColor);
    setTextColor(textColor);
    setBgColor(bgColor);
  };

  useEffect(() => {
    ipcRenderer.send('save-overlay-prefs', baniOverlayState);
  });

  return (
    <section className="theme-selector">
      <p className="overlay-window-text theme-selector-header">Themes</p>
      {getThemeMarkup(themeObjects, handleThemeChange)}
    </section>
  );
};
