/* global Mousetrap */
const shortcutsMap = require('./shortcuts-map.json');

const shortcutFactory = (keys, actionName) => {
  Mousetrap.bindGlobal(keys, () => {
    global.platform.ipc.send('shortcuts', actionName);
  });
};

const applyShortcuts = () => {
  Object.keys(shortcutsMap).forEach(actionName => {
    shortcutFactory(shortcutsMap[actionName], actionName);
  });
};

module.exports = {
  applyShortcuts,
};
