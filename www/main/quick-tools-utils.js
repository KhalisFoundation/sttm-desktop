import { fontSizeSetting } from './viewer/font-sizes';

const firstCharToUpperCase = (str) => `${str.charAt(0).toUpperCase()}${str.slice(1)}`;

// Remote controls (the Bani Controller phone app and the presenter remote) reach
// the same settings the local Quick Tools steppers do, so they have to resolve
// them the same way. Font sizes are kept per view (see `font-sizes`), and a
// control that ignored that would appear to do nothing while quietly resizing
// the view the operator cannot see.
export const changeFontSize = (iconType, increase = true) => {
  const setting = fontSizeSetting(iconType, global.getUserSettings.akhandpatt);
  // A slot with no per-view size keeps its own naming, as does anything a remote
  // sends that this build does not recognise.
  const setterAction = setting
    ? setting.actionName
    : `set${firstCharToUpperCase(iconType)}FontSize`;
  const getterVar = setting ? setting.stateName : `${iconType}FontSize`;
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
