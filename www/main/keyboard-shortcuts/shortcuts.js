/* global Mousetrap */
const shortcutsMap = require('../../configs/shortcuts-map.json');

const shortcutsApplied = {
  viewer: false,
  'non-viewer': false,
};

const shortcutFactory = (keys, actionName) => {
  Mousetrap.bind(keys, (event) => {
    global.platform.ipc.send('shortcuts', JSON.stringify({ actionName, event }));
    // prevents the default action for all keys, except left and right arrow keys
    if (!['left', 'right'].some(k => keys.includes(k))) {
      event.preventDefault();
    }
  });
};

const applyShortcuts = (source) => {
  if (!shortcutsApplied[source]) {
    Object.keys(shortcutsMap).forEach((actionName) => {
      shortcutFactory(shortcutsMap[actionName], actionName);
    });
    shortcutsApplied[source] = true;
  }
};

module.exports = {
  applyShortcuts,
};
