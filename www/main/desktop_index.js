/* eslint import/no-unresolved: 0 */
import GlobalState from './js/common/store/GlobalState';

global.userSettings = GlobalState.getState().userSettings;
global.applySettings = GlobalState.getActions().userSettings;

console.log(global.applySettings);

global.platform = require('./js/desktop_scripts');
global.controller = require('./js/controller');
global.core = require('./js/index');

// Pull in navigator from core
global.core.search.init();
global.core.menu.init();
global.core.shortcutTray.init();
global.core.themeEditor.init();
global.platform.init();

document.body.classList.add(process.platform);
