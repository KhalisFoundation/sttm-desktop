const firstCharToUpperCase = (str) => `${str.charAt(0).toUpperCase()}${str.slice(1)}`;

// Conservative clamps so spamming the minus button can't push a slider to
// zero/negative and the plus button can't run away with the font size.
// The shipped defaults are 4/5/9, so 1..30 leaves ample headroom either way.
const FONT_SIZE_MIN = 1;
const FONT_SIZE_MAX = 30;

const clampFontSize = (value) => {
  if (Number.isNaN(value)) return FONT_SIZE_MIN;
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, value));
};

export const changeFontSize = (iconType, increase = true) => {
  const setterAction = `set${firstCharToUpperCase(iconType)}FontSize`;
  const getterVar = `${iconType}FontSize`;
  const oldValue = parseInt(global.getUserSettings[getterVar], 10);
  const newValue = clampFontSize(increase ? oldValue + 1 : oldValue - 1);
  if (newValue === oldValue) return;
  try {
    global.setUserSettings[setterAction](newValue);
  } catch (error) {
    console.error('Error changing font size:', error);
  }
};

export const changeVisibility = (iconType) => {
  const setterAction = `set${firstCharToUpperCase(iconType)}Visibility`;
  const getterVar = `${iconType}Visibility`;
  const oldValue = global.getUserSettings[getterVar];
  try {
    global.setUserSettings[setterAction](!oldValue);
  } catch (error) {
    console.error('Error changing visibility:', error);
  }
};
