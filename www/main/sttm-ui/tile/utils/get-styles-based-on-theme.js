import themesArr from '../../../../configs/themes.json';
console.log(typeof themesArr);

const themesMap = themesArr.reduce((themesObj, theme) => (themesObj[theme.name] = theme), {});

const getStylesBasedOnTheme = themeName => {
  const theme = themesMap[themeName];
  return {
    bgColor: theme['background-color'] || '',
    textColor: theme['gurbani-color'] || '',
    bgImageUrl: theme['background-image'] || '',
  };
};
