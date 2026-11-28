/* eslint import/no-unresolved: 0, import/extensions: 0 */
import GlobalState from './js/common/store/GlobalState';

global.platform = require('./js/desktop_scripts');
global.controller = require('./js/controller');
global.core = require('./js/index');

global.getUserSettings = GlobalState.getState().userSettings;
global.setUserSettings = GlobalState.getActions().userSettings;

// Pull in navigator from core
global.core.menu.init();
global.platform.init();

// Location-based releases, e.g. a new default translation source
require('./js/gradual-releases').runGradualReleases(GlobalState);

document.body.classList.add(process.platform);
