/* eslint import/no-unresolved: 0 */
global.platform = require('./js/desktop_scripts');
global.controller = require('./js/controller');
global.core = require('./js/index');

// Pull in navigator from core
global.core.search.init();
global.core.menu.init();
global.core.shortcutTray.init();
global.core.toolbar.init();
global.core.themeEditor.init();
global.core.shareSync.init();
global.platform.init();

document.body.classList.add(process.platform);
