const firstCharToUpperCase = (str) => `${str.charAt(0).toUpperCase()}${str.slice(1)}`;

export const changeFontSize = (iconType, increase = true) => {
  const setterAction = `set${firstCharToUpperCase(iconType)}FontSize`;
  const getterVar = `${iconType}FontSize`;
  const oldValue = parseInt(global.getUserSettings[getterVar], 10);
  const newValue = increase ? oldValue + 1 : oldValue - 1;
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
