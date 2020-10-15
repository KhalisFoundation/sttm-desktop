const copy = require('./copy');
const search = require('./search');
const menu = require('./menu');
const themeEditor = require('./theme_editor');
const settings = require('.//settings');
const shortcutTray = require('./shortcut_tray');
const { applyShortcuts } = require('./keyboard-shortcuts/shortcuts');
const { updateInsertedSlide } = require('./keyboard-shortcuts/shortcut-functions');

// is the current slide of the shabad (= false) or an inserted slide (= true)
function findLine(e) {
  e.preventDefault();
  const filterKey = e.key;

  // Find position of current line in shabad
  const pos = search.currentShabad.indexOf(search.currentLine);

  // Rotate the array based on current shabad
  const panktees = [...search.$shabad.getElementsByClassName('panktee')];
  const pankteesBeforePos = panktees.splice(0, pos + 1);
  const pankteesRotated = [...panktees, ...pankteesBeforePos];

  const lineFound = pankteesRotated.find(panktee => {
    const pankteeText = panktee.getAttribute('data-main-letters');
    return pankteeText.substring(0, 1) === filterKey;
  });

  if (lineFound) {
    lineFound.click();
  }
}

applyShortcuts('non-viewer');

const $shabadPage = document.getElementById('shabad-page');
if ($shabadPage) {
  $shabadPage.addEventListener('keypress', findLine);
}

/**
 * Check if the platform has a method and call if it is does
 *
 * @since 3.2.2
 * @param {string} method Name of the platform method
 * @param {any} args Arguments to be passed to the method
 * @example
 *
 * global.core.platformMethod('updateSettings');
 */
function platformMethod(method, args) {
  if (typeof global.platform[method] === 'function') {
    global.platform[method](args);
  }
}

global.platform.ipc.on('sync-settings', () => {
  settings.init();
});
module.exports = {
  copy,
  menu,
  search,
  platformMethod,
  themeEditor,
  updateInsertedSlide,
  shortcutTray,
  'custom-theme': () => {
    themeEditor.init();
  },
  akhandpaatt: search.akhandPaatt,
};
