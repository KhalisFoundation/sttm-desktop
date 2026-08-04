const menu = require('./menu');
const themeEditor = require('./theme_editor');
const settings = require('./settings');

const { syncViewerState } = require('./common/store/GlobalState');

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

// The settings pane needs redrawing.
global.platform.ipc.on('sync-settings', () => {
  settings.init();
});

// A deck has just been created. The in-app preview's `<webview>` handles this
// for itself in `ViewerContent`, but the presentation window is opened by the
// main process, which has no access to the settings. It asks here instead.
global.platform.ipc.on('viewer-window-ready', () => {
  syncViewerState();
});
module.exports = {
  menu,
  platformMethod,
  themeEditor,
  'custom-theme': () => {
    themeEditor.init();
  },
};
