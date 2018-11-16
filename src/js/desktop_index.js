/* eslint import/no-unresolved: 0 */
global.platform = require('./desktop_scripts');
global.controller = require('./controller');
global.core = require('./index');

// Pull in navigator from core
global.core.search.init();
global.core.menu.init();
global.core.themeEditor.init();
// global.core.shareSync.init();
global.platform.init();

document.body.classList.add(process.platform);
