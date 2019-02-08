const h = require('hyperscript');
const shortcutItemsJSON = require('./shortcut_tray.json');

const trayItemFactory = (trayItemKey, trayItem) => h(
  `div.tray-item#tray-${trayItemKey}`,
  trayItem.label,
);

module.exports = {
  init() {
    const shortcutTrayContainer = document.querySelector('.shortcut-tray');

    Object.keys(shortcutItemsJSON).forEach((itemKey) => {
      shortcutTrayContainer.appendChild(trayItemFactory(itemKey, shortcutItemsJSON[itemKey]));
    });
  },
};
