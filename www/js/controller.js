/* global Mousetrap */
const electron = require('electron');
const viewer = require('./viewer');

const remote = electron.remote;
const app = remote.app;
const Menu = remote.Menu;

const WinMenu = Menu.buildFromTemplate([
  {
    label: 'File',
    submenu: [
      /* {
        label: 'Preferences',
        accelerator: 'Ctrl+,',
        click: () => {
          settings.openSettings();
        },
      },
      {
        type: 'separator',
      }, */
      {
        label: 'Quit',
        accelerator: 'Ctrl+Q',
        click: () => {
          app.quit();
        },
      },
    ],
  },
  {
    label: 'Help',
    submenu: [
      {
        label: 'Check for Updates...',
        accelerator: 'Ctrl+U',
        click: () => {
          global.platform.ipc.send('checkForUpdates');
        },
      },
      {
        label: 'Changelog...',
        click: () => {
          global.platform.ipc.send('openChangelog');
        },
      },
    ],
  },
]);

// Mousetrap.bindGlobal('mod+,', () => settings.openSettings());
Mousetrap.bindGlobal('mod+q', () => {
  app.quit();
});

const $menuButton = document.querySelector('.menu-button');
$menuButton.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  e.stopPropagation();
  WinMenu.popup(remote.getCurrentWindow());
});
$menuButton.addEventListener('click', () => {
  const e = $menuButton.ownerDocument.createEvent('MouseEvents');
  e.initMouseEvent('contextmenu', true, true,
    $menuButton.ownerDocument.defaultView, 1, 0, 0, 0, 0, false,
    false, false, false, 2, null);
  return !$menuButton.dispatchEvent(e);
});

function updateViewerScale() {
  const $fitInsideWindow = document.body.classList.contains('presenter-view') ? document.getElementById('navigator') : document.body;
  let scale = 1;
  let previewStyles = '';
  previewStyles += `width: ${global.viewer.width}px;`;
  previewStyles += `height: ${global.viewer.height}px;`;
  previewStyles += `font-size: ${global.viewer.height / 100}px;`;

  const fitInsideWidth = $fitInsideWindow.offsetWidth;
  const fitInsideHeight = $fitInsideWindow.offsetHeight;
  const fitInsideStyle = window.getComputedStyle($fitInsideWindow);
  const fitInsidePadding = fitInsideStyle.getPropertyValue('right');
  const viewerRatio = global.viewer.width / global.viewer.height;

  // Try scaling by width first
  const proposedHeight = fitInsideWidth / viewerRatio;
  if (fitInsideHeight > proposedHeight) {
    scale = fitInsideWidth / global.viewer.width;
    previewStyles += `right: ${fitInsidePadding};`;
    previewStyles += `top: calc(${fitInsidePadding} + ${(fitInsideHeight - proposedHeight) / 2}px);`;
  } else {
    scale = fitInsideHeight / global.viewer.height;
    const proposedWidth = fitInsideHeight * viewerRatio;
    previewStyles += `top: ${fitInsidePadding};`;
    previewStyles += `right: calc(${fitInsidePadding} + ${(fitInsideWidth - proposedWidth) / 2}px);`;
  }
  previewStyles += `transform: scale(${scale});`;
  previewStyles = document.createTextNode(`.scale-viewer #viewer { ${previewStyles} }`);
  const $previewStyles = document.getElementById('preview-styles');

  if ($previewStyles) {
    $previewStyles.innerHTML = '';
    $previewStyles.appendChild(previewStyles);
  } else {
    const style = document.createElement('style');
    style.id = 'preview-styles';
    style.appendChild(previewStyles);
    document.head.appendChild(style);
  }
}

global.platform.ipc.on('presenter-view', (e, args) => {
  if (global.platform.getUserPref('app.layout.presenter-view')) {
    document.body.classList.add('presenter-view');
    document.body.classList.remove('home');
  }
  document.body.classList.add('scale-viewer');
  global.viewer = {
    width: args.width,
    height: args.height,
  };
  updateViewerScale();
});
global.platform.ipc.on('remove-scale-viewer', () => {
  document.body.classList.remove('scale-viewer');
});
window.onresize = () => {
  updateViewerScale();
};

/* global.platform.ipc.on('openSettings', () => {
  settings.openSettings();
}); */

module.exports = {
  sendLine(shabadID, lineID) {
    viewer.showLine(shabadID, lineID);
    global.platform.ipc.send('show-line', { shabadID, lineID });
  },

  sendText(text) {
    viewer.showText(text);
    global.platform.ipc.send('show-text', { text });
  },

  'presenter-view': function presenterView() {
    updateViewerScale();
  },
};
