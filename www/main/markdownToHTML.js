/* eslint import/no-unresolved: 0, import/extensions: 0 */
// Loaded by a <script> tag, so paths resolve from the HTML file in www/, not from www/js/.
import { i18n } from './js/common/i18n';

const marked = require('marked');
const fs = require('fs');
const path = require('path');

const markdownFiles = {
  changelog: '../CHANGELOG.md',
  help: '../HELP.md',
  legend: '../LEGEND.md',
};

function markdownToHTML(file) {
  const fileMD = fs.readFileSync(path.resolve(__dirname, markdownFiles[file]), 'utf8');
  const $file = document.getElementById(file);
  if ($file) {
    $file.innerHTML = marked.parse(fileMD);
  }
}

const key = document.querySelector('h1').innerHTML;
document.querySelector('h1').innerHTML = i18n.t(key);

Object.keys(markdownFiles).forEach(markdownToHTML);
