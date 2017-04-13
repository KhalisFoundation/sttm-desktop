/* eslint import/no-unresolved: 0 */
const fs = require('fs');
const path = require('path');
global.platform = require('./js/desktop_scripts');
global.controller = require('./js/controller');
const core = require('./core/js/index.js');

// Pull in navigator from core
const navigator = fs.readFileSync(path.resolve(__dirname, 'core/navigator.html'));
document.querySelector('#navigator').innerHTML = navigator;
core.search.init();

document.body.classList.add(process.platform);
