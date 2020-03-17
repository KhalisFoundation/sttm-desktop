/* global Mousetrap */
const shortcutsMap = require('./shortcuts-map.json');

const shortcutsApplied = {
  viewer: false,
  'non-viewer': false,
};

const shortcutFactory = (keys, actionName) => {
  Mousetrap.bind(keys, event => {
    global.platform.ipc.send('shortcuts', { actionName, event });
    event.preventDefault();
  });
};

const applyShortcuts = source => {
  if (!shortcutsApplied[source]) {
    Object.keys(shortcutsMap).forEach(actionName => {
      shortcutFactory(shortcutsMap[actionName], actionName);
    });
    shortcutsApplied[source] = true;
  }
};

module.exports = {
  applyShortcuts,
};
