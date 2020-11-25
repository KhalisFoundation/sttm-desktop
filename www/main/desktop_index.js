/* eslint import/no-unresolved: 0 */
import GlobalState from './js/common/store/GlobalState';

global.platform = require('./js/desktop_scripts');
global.controller = require('./js/controller');
global.core = require('./js/index');

global.userSettings = GlobalState.getState().userSettings;
global.applySettings = GlobalState.getActions().userSettings;

// Pull in navigator from core
global.core.search.init();
global.core.menu.init();
global.core.shortcutTray.init();
global.core.themeEditor.init();
global.platform.init();

document.body.classList.add(process.platform);
