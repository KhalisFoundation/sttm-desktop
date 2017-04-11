// Node packages
const fs = require('fs');
const path = require('path');

// Pull in navigator from core
const navigator = fs.readFileSync(path.resolve(__dirname, 'core/navigator.html'));
document.querySelector('#navigator').innerHTML = navigator;

const platform = require('./js/desktop_scripts');
require('./core/js/index.js');

document.body.classList.add(process.platform);
