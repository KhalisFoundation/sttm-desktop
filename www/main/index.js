const menu = require('./menu');
const themeEditor = require('./theme_editor');
const settings = require('.//settings');
const { applyShortcuts } = require('./keyboard-shortcuts/shortcuts');

applyShortcuts('non-viewer');

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
  menu,
  platformMethod,
  themeEditor,
  'custom-theme': () => {
    themeEditor.init();
  },
};
