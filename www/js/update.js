/* eslint import/no-extraneous-dependencies: 0 */
const { ipcRenderer, remote } = require('electron');
const h = require('hyperscript');

ipcRenderer.on('checking-for-update', () => {
  document.body.classList.add('checking-for-update');
});
ipcRenderer.on('no-update', () => {
  document.body.classList.remove('checking-for-update');
  document.body.classList.add('no-update');
  setTimeout(() => {
    document.body.classList.remove('no-update');
  }, 5000);
});
ipcRenderer.on('updating', () => {
  document.body.classList.remove('checking-for-update');
  document.body.classList.add('updating');
});
ipcRenderer.on('updateReady', () => {
  document.body.classList.remove('checking-for-update', 'updating', 'no-update', 'update-error');
  document.body.classList.add('update-ready');
});
ipcRenderer.on('update-error', () => {
  document.body.classList.remove('checking-for-update');
  document.body.classList.add('update-error');
});

document.querySelector('#update-frame').appendChild(h(
  'div.update-buttons',
  [
    h('a.button.no-update.update-error',
      {
        onclick: () => {
          remote.getCurrentWindow().close();
        } },
      'OK'),
    h('a.button.update-ready',
      {
        onclick: () => {
          remote.getCurrentWindow().close();
        } },
      'Dismiss'),
    h('a.button.update-ready',
      {
        onclick: () => {
          ipcRenderer.send('quitAndInstall');
        } },
      'Install')]));
