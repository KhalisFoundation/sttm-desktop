import convertObjToCamelCase from '../../utils/convert-object-to-camel-case';

import { savedSettings } from './get-saved-user-settings';

const { sidebar, bottomBar } = require('../../../../configs/overlay.json');

function getOverlaySettings() {
  const settings = { ...sidebar.settings, ...bottomBar.settings };
  if (savedSettings.baniOverlay) {
    return savedSettings;
  }
  const defaultSettings = {};
  Object.keys(settings).forEach(key => {
    defaultSettings[key] = settings[key].initialValue;
  });
  savedSettings.baniOverlay = defaultSettings;
  return savedSettings;
}

export const savedOverlaySettings = getOverlaySettings();

export const overlaySettingsCamelCase = () => {
  const newObj = convertObjToCamelCase(savedOverlaySettings.baniOverlay);
  savedOverlaySettings.baniOverlay = newObj;
  return convertObjToCamelCase(savedOverlaySettings);
};
