const changelog = require('../../../CHANGELOG.md');
const help = require('../../../HELP.md');

const markdownFiles = {
  changelog,
  help,
};

function markdownToHTML(file) {
  const fileMD = markdownFiles[file];
  const $file = document.getElementById(file);
  if ($file) { $file.innerHTML = fileMD; }
}

Object.keys(markdownFiles).forEach(markdownToHTML);
