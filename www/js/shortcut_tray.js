const h = require('hyperscript');
const { remote } = require('electron');
const shortcutItemsJSON = require('./shortcut_tray.json');

const { store } = remote.require('./app');

const analytics = remote.getGlobal('analytics');

const shortcutTrayContainer = document.querySelector('.shortcut-tray');
let isShortcutTrayOn = store.getUserPref('slide-layout.display-options.shortcut-tray-on');

const trayItemFactory = (trayItemKey, trayItem) =>
  h(
    `div.tray-item.${trayItem.labelType}#tray-${trayItemKey}`,
    {
      onclick: () => {
        analytics.trackEvent('shortcutTray', trayItemKey);
        if (trayItem.type === 'text') {
          global.controller.sendText(trayItem.ref, true);
          global.core.updateInsertedSlide(true);
        } else if (trayItem.type === 'shabad') {
          global.core.search.loadShabad(trayItem.ref);
          global.core.updateInsertedSlide(true);
        } else if (trayItem.type === 'ceremony') {
          global.core.search.loadCeremony(trayItem.ref).catch(error => {
            analytics.trackEvent('ceremonyFailed', trayItem.ref, error);
          });
        }
      },
    },
    h('div.tray-item-icon', h('div.tray-item-label', trayItem.label)),
  );

const shortcutsToggle = h(
  'div.shortcut-toggle',
  {
    onclick: () => {
      isShortcutTrayOn = !isShortcutTrayOn;
      analytics.trackEvent('shortcutTrayToggle', isShortcutTrayOn);
      store.setUserPref('slide-layout.display-options.shortcut-tray-on', isShortcutTrayOn);
      global.core.platformMethod('updateSettings');
      document
        .querySelector('i.shortcut-toggle-icon')
        .classList.toggle('fa-caret-up', !isShortcutTrayOn);
      document
        .querySelector('i.shortcut-toggle-icon')
        .classList.toggle('fa-caret-down', isShortcutTrayOn);
    },
  },
  h(`i.shortcut-toggle-icon.fa.${isShortcutTrayOn ? 'fa-caret-down' : 'fa-caret-up'}`),
);

module.exports = {
  init() {
    Object.keys(shortcutItemsJSON).forEach(itemKey => {
      shortcutTrayContainer.appendChild(trayItemFactory(itemKey, shortcutItemsJSON[itemKey]));
    });

    document.querySelector('#footer').appendChild(shortcutsToggle);
  },
};
