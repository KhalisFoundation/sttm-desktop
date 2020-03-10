/* global Mousetrap */
const shortcutsMap = require('./shortcuts-map.json');

const shortcutsApplied = {
  viewer: false,
  'non-viewer': false,
};

const shortcutFactory = (keys, actionName) => {
  if (actionName === 'findLine') {
    const $shabadPage = document.getElementById('shabad-page');
    const $viewer = document.querySelector('.viewer');
    const findLineMiddleware = e => {
      e.preventDefault();
      const shortObj = { actionName: 'findLine', keyEvent: e };
      global.platform.ipc.send('shortcuts', shortObj);
    };

    if ($shabadPage) {
      $shabadPage.addEventListener('keypress', event => {
        findLineMiddleware(event);
      });
    }
    if ($viewer) {
      $viewer.addEventListener('keypress', event => {
        findLineMiddleware(event);
      });
    }
  } else {
    Mousetrap.bind(keys, event => {
      global.platform.ipc.send('shortcuts', { actionName, keyEvent: event });
      event.preventDefault();
    });
  }
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
