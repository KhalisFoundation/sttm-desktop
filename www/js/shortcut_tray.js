const h = require('hyperscript');
const shortcutItemsJSON = require('./shortcut_tray.json');
const { remote } = require('electron');

const { store } = remote.require('./app');

const shortcutTrayContainer = document.querySelector('.shortcut-tray');
let isShortcutTrayOn = store.getUserPref('slide-layout.display-options.shortcut-tray-on');

const trayItemFactory = (trayItemKey, trayItem) => h(
  `div.tray-item#tray-${trayItemKey}`,
  h(
    'div.tray-item-icon',
    h('div.tray-item-label', trayItem.label),
  ),
);

const shortcutsToggle = h(
  'div.shortcut-toggle',
  {
    onclick: () => {
      isShortcutTrayOn = !isShortcutTrayOn;
      store.setUserPref('slide-layout.display-options.shortcut-tray-on', isShortcutTrayOn);
      global.core.platformMethod('updateSettings');
      document.querySelector('i.shortcut-toggle-icon').classList.toggle('fa-th-large', !isShortcutTrayOn);
      document.querySelector('i.shortcut-toggle-icon').classList.toggle('fa-times', isShortcutTrayOn);
    },
  },
  h(`i.shortcut-toggle-icon.fa.${isShortcutTrayOn ? 'fa-times' : 'fa-th-large'}`),
  'Shortcuts Tray',
);

module.exports = {
  init() {
    Object.keys(shortcutItemsJSON).forEach((itemKey) => {
      shortcutTrayContainer.appendChild(trayItemFactory(itemKey, shortcutItemsJSON[itemKey]));
    });

    document.querySelector('#footer').appendChild(shortcutsToggle);
  },
};
