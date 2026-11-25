import React from 'react';
import { useStoreActions, useStoreState } from 'easy-peasy';

import convertToCamelCase from '../../common/utils/convert-to-camel-case';
import { i18n } from '../../common/i18n';

const remote = require('@electron/remote');

const analytics = remote.getGlobal('analytics');
const themeObjects = require('../../../configs/overlay_presets.json');

export const ThemeSelector = () => {
  const { setOverlayTheme, setTextColor, setBgColor, setGurbaniTextColor } = useStoreActions(
    (state) => state.baniOverlay,
  );
  const { overlayTheme, gurbaniTextColor, textColor, bgColor } = useStoreState(
    (state) => state.baniOverlay,
  );
  // Older saved settings hold the theme in kebab case (the default is "a-new-day").
  const currentTheme = convertToCamelCase(overlayTheme);

  const handleThemeChange = (themeName) => {
    const clickedThemeObj = themeObjects[themeName];
    if (themeName !== currentTheme) {
      setOverlayTheme(themeName);
    }
    if (clickedThemeObj.textColor !== textColor) {
      setTextColor(clickedThemeObj.textColor);
    }
    if (clickedThemeObj.gurbaniTextColor !== gurbaniTextColor) {
      setGurbaniTextColor(clickedThemeObj.gurbaniTextColor);
    }
    if (clickedThemeObj.bgColor !== bgColor) {
      setBgColor(clickedThemeObj.bgColor);
    }
    analytics.trackEvent({
      category: 'Theme',
      action: 'change theme',
      label: 'theme name',
      value: themeName,
    });
  };

  return (
    <div className="overlay-themes">
      {Object.keys(themeObjects).map((themeName) => {
        const theme = themeObjects[themeName];
        return (
          <button
            key={themeName}
            type="button"
            className="overlay-theme"
            aria-pressed={themeName === currentTheme}
            style={{ color: theme.gurbaniTextColor, background: theme.bgColor }}
            onClick={() => handleThemeChange(themeName)}
          >
            {i18n.t(`THEMES.${theme.label}`)}
          </button>
        );
      })}
    </div>
  );
};
