import themesArr from '../../../../configs/themes.json';

/* eslint-disable no-param-reassign */
const themesMap = themesArr.reduce((themesObj, theme) => {
  themesObj[theme.name] = { ...theme };
  return themesObj;
}, {});

const getStylesBasedOnTheme = themeName => {
  const theme = themesMap[themeName];
  const tileStyles = {
    bgColor: theme ? theme['background-color'] : '',
    textColor: theme ? theme['gurbani-color'] : '',
    bgImageUrl: theme ? theme['background-image'] : '',
  };
  return tileStyles;
};
export default getStylesBasedOnTheme;
