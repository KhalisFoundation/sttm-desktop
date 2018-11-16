/* eslint-disable global-require */
const markdownFiles = {
  changelog: require('../../CHANGELOG.md'),
  help: require('../../HELP.md'),
};

function markdownToHTML(file) {
  const fileMD = markdownFiles[file];
  const $file = document.getElementById(file);
  if ($file) { $file.innerHTML = fileMD; }
}

Object.keys(markdownFiles).forEach(markdownToHTML);
