import themesArr from '../../../../configs/themes.json';

/* eslint-disable no-param-reassign */
const themesMap = themesArr.reduce((themesObj, theme) => {
  themesObj[theme.name] = { ...theme };
  return themesObj;
}, {});

const getStylesBasedOnTheme = themeName => {
  // console.log(themesMap, 'themeMap')
  const theme = themesMap[themeName];
  const tileStyles = {
    bgColor: theme['background-color'] || '',
    textColor: theme['gurbani-color'] || '',
    bgImageUrl: theme['background-image'] || '',
  };
  return tileStyles;
};
export default getStylesBasedOnTheme;
