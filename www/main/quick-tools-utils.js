const firstCharToUpperCase = (str) => `${str.charAt(0).toUpperCase()}${str.slice(1)}`;

export const changeFontSize = (iconType, increase = true) => {
  const setterAction = `set${firstCharToUpperCase(iconType)}FontSize`;
  const getterVar = `${iconType}FontSize`;
  const oldValue = parseInt(global.getUserSettings[getterVar], 10);
  const newValue = increase ? oldValue + 1 : oldValue - 1;
  global.setUserSettings[setterAction](newValue);
};

export const changeVisibility = (iconType) => {
  const setterAction = `set${firstCharToUpperCase(iconType)}Visibility`;
  const getterVar = `${iconType}Visibility`;
  const oldValue = global.getUserSettings[getterVar];
  global.setUserSettings[setterAction](!oldValue);
};
