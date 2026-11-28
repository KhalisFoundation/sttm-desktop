// eslint-disable-next-line import/no-unresolved
const { trackEvent } = require('@aptabase/electron/main');
const isOnline = require('is-online');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
require('dotenv').config();

// The "Collect statistics" setting (`statistics` in configs/user-settings.json).
// The renderer saves it to user-data.json; it is on unless the user turned it off.
const readCollectStatistics = () => {
  try {
    const userConfigPath = path.join(app.getPath('userData'), 'user-data.json');
    const savedSettings = JSON.parse(fs.readFileSync(userConfigPath));
    return savedSettings.statistics !== false;
  } catch (e) {
    return true;
  }
};

// Aptabase only breaks a property down by its values when the value is a
// string; numbers are summarised as Median/Min/Max/Sum. So everything is sent
// as a string (Aptabase rejects other types, such as booleans and objects).
const toPropString = (prop) => {
  if (prop === undefined || prop === null) return '';
  // Errors from the renderer arrive through remote, so check for a message
  // rather than relying on instanceof.
  if (prop instanceof Error || (typeof prop === 'object' && typeof prop.message === 'string')) {
    return prop.message;
  }
  if (typeof prop === 'object') {
    try {
      return JSON.stringify(prop);
    } catch (e) {
      return String(prop);
    }
  }
  return String(prop);
};

class Analytics {
  constructor() {
    this.enabled = readCollectStatistics();
  }

  // Called when the user changes "Collect statistics" (see app.js).
  setEnabled(enabled) {
    this.enabled = enabled !== false;
  }

  trackEvent({ category, action, label, value }) {
    if (!this.enabled) return;
    isOnline().then((online) => {
      // TODO: for offline users, come up with a way of storing and send when online.
      // Checked again here, in case the setting was turned off while waiting.
      if (online && this.enabled) {
        trackEvent(action, {
          category: toPropString(category),
          label: toPropString(label),
          value: toPropString(value),
        });
      }
    });
  }
}

module.exports = Analytics;
