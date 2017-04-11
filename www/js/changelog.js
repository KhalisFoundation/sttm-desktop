const marked = require('marked');
const fs = require('fs');
const path = require('path');

const changelogMD = fs.readFileSync(path.resolve(__dirname, '../CHANGELOG.md'), 'utf8');

document.getElementById('changelog').innerHTML = marked(changelogMD);
