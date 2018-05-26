/* global Mousetrap */
const electron = require('electron');

const remote = electron.remote;
const app = remote.app;
const Menu = remote.Menu;
const main = remote.require('./app');

global.webview = document.querySelector('webview');

global.webview.addEventListener('dom-ready', () => {
  global.webview.send('is-webview');
});

global.webview.addEventListener('ipc-message', (event) => {
  switch (event.channel) {
    case 'scroll-pos': {
      const pos = event.args[0];
      global.platform.ipc.send('scroll-from-main', pos);
      break;
    }
    default:
      break;
  }
});

const updateMenu = [
  {
    label: `Version ${main.appVersion}`,
    enabled: false,
  },
  {
    label: 'Check for Update',
    accelerator: 'CmdOrCtrl+U',
    click: () => {
      main.checkForUpdates(true);
    },
  },
  {
    label: 'Checking for Updates',
    enabled: false,
    visible: false,
  },
  {
    label: 'Downloading Update',
    enabled: false,
    visible: false,
  },
  {
    label: 'Install and Restart',
    click: () => {
      main.autoUpdater.quitAndInstall();
    },
    visible: false,
  },
];

const menuTemplate = [
  {
    label: 'Edit',
    submenu: [
      {
        label: 'Undo',
        accelerator: 'CmdOrCtrl+Z',
        role: 'undo',
      },
      {
        label: 'Redo',
        accelerator: 'CmdOrCtrl+Shift+Z',
        role: 'redo',
      },
      {
        type: 'separator',
      },
      {
        label: 'Cut',
        accelerator: 'CmdOrCtrl+X',
        role: 'cut',
      },
      {
        label: 'Copy',
        accelerator: 'CmdOrCtrl+C',
        role: 'copy',
      },
      {
        label: 'Paste',
        accelerator: 'CmdOrCtrl+V',
        role: 'paste',
      },
      {
        label: 'Select All',
        accelerator: 'CmdOrCtrl+A',
        role: 'selectall',
      },
    ],
  },
  {
    label: 'Window',
    role: 'window',
    submenu: [
      {
        label: 'Minimize',
        accelerator: 'CmdOrCtrl+M',
        role: 'minimize',
      },
      {
        label: 'Close',
        accelerator: 'CmdOrCtrl+W',
        role: 'close',
      },
    ],
  },
];

const devMenu = [];

if (process.env.NODE_ENV === 'development') {
  devMenu.push({
    label: 'Dev',
    submenu: [
      {
        label: 'Toggle Developer Tools',
        accelerator: 'CmdOrCtrl+Alt+I',
        click: () => {
          remote.getCurrentWindow().toggleDevTools();
        },
      },
      {
        label: 'Reload',
        accelerator: 'CmdOrCtrl+R',
        click: () => {
          remote.getCurrentWindow().reload();
        },
      },
    ],
  });
}

const winMenu = [
  {
    label: 'File',
    submenu: [
      {
        label: 'Preferences',
        accelerator: 'Ctrl+,',
        click: () => {
          global.core.menu.toggleMenu();
        },
      },
      {
        type: 'separator',
      },
      {
        label: 'Quit',
        accelerator: 'Ctrl+Q',
        click: () => {
          app.quit();
        },
      },
    ],
  },
  ...menuTemplate,
  {
    label: 'Help',
    submenu: [
      {
        label: '',
        enabled: false,
      },
      ...updateMenu,
      {
        label: 'Guide...',
        click: () => {
          main.openSecondaryWindow('helpWindow');
        },
      },
      {
        label: 'Changelog...',
        click: () => {
          main.openSecondaryWindow('changelogWindow');
        },
      },
    ],
  },
  ...devMenu,
  {
    label: 'Donate',
    click: () => {
      electron.shell.openExternal('https://khalisfoundation.org/donate/');
    },
  },
];

const macMenu = [
  {
    label: 'SikhiToTheMax',
    submenu: [
      {
        label: 'About SikhiToTheMax',
        role: 'about',
      },
      ...updateMenu,
      {
        type: 'separator',
      },
      {
        label: 'Preferences',
        accelerator: 'Cmd+,',
        click: () => {
          global.core.menu.toggleMenu();
        },
      },
      {
        type: 'separator',
      },
      {
        label: 'Services',
        role: 'services',
        submenu: [],
      },
      {
        type: 'separator',
      },
      {
        label: 'Hide SikhiToTheMax',
        accelerator: 'Cmd+H',
        role: 'hide',
      },
      {
        label: 'Hide Others',
        accelerator: 'Cmd+Alt+H',
        role: 'hideothers',
      },
      {
        type: 'separator',
      },
      {
        label: 'Quit SikhiToTheMax',
        accelerator: 'CmdOrCtrl+Q',
        click: () => {
          app.quit();
        },
      },
    ],
  },
  ...menuTemplate,
  {
    label: 'Help',
    submenu: [
      {
        label: 'Guide...',
        click: () => {
          main.openSecondaryWindow('helpWindow');
        },
      },
      {
        label: 'Changelog...',
        click: () => {
          main.openSecondaryWindow('changelogWindow');
        },
      },
    ],
  },
  ...devMenu,
  {
    label: 'Donate',
    click: () => {
      electron.shell.openExternal('https://khalisfoundation.org/donate/');
    },
  },
];
const menu = Menu.buildFromTemplate(process.platform === 'darwin' || process.platform === 'linux' ? macMenu : winMenu);
if (process.platform === 'darwin' || process.platform === 'linux') {
  Menu.setApplicationMenu(menu);
}

// Mousetrap.bindGlobal('mod+,', () => settings.openSettings());
Mousetrap.bindGlobal('mod+q', () => {
  app.quit();
});

const $menuButton = document.querySelector('.menu-button');
$menuButton.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  e.stopPropagation();
  menu.popup(remote.getCurrentWindow());
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
  let previewWinStyles = '';
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
    previewWinStyles += `top: calc(${fitInsidePadding} + 25px + ${(fitInsideHeight - proposedHeight) / 2}px);`;
  } else {
    scale = fitInsideHeight / global.viewer.height;
    const proposedWidth = fitInsideHeight * viewerRatio;
    previewStyles += `top: ${fitInsidePadding};`;
    previewWinStyles += `top: calc(${fitInsidePadding} + 25px);`;
    previewStyles += `right: calc(${fitInsidePadding} + ${(fitInsideWidth - proposedWidth) / 2}px);`;
  }
  previewStyles += `transform: scale(${scale});`;
  previewStyles = document.createTextNode(
    `.scale-viewer #main-viewer { ${previewStyles} }
    .scale-viewer.win32 #main-viewer { ${previewWinStyles} }`);
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

const menuUpdate = (process.platform === 'darwin' || process.platform === 'linux' ? menu.items[0].submenu : menu.items[3].submenu);
global.platform.ipc.on('checking-for-update', () => {
  menuUpdate.items[2].visible = false;
  menuUpdate.items[3].visible = true;
});
global.platform.ipc.on('update-available', () => {
  menuUpdate.items[3].visible = false;
  menuUpdate.items[4].visible = true;
});
global.platform.ipc.on('update-not-available', () => {
  menuUpdate.items[3].visible = false;
  menuUpdate.items[2].visible = true;
});
global.platform.ipc.on('update-downloaded', () => {
  menuUpdate.items[4].visible = false;
  menuUpdate.items[5].visible = true;
});

global.platform.ipc.on('send-scroll', (event, arg) => {
  global.webview.send('send-scroll', arg);
});

global.platform.ipc.on('next-ang', (event, arg) => {
  global.core.search.loadAng(arg.PageNo, arg.SourceID);
});

/* global.platform.ipc.on('openSettings', () => {
  settings.openSettings();
}); */

module.exports = {
  clearAPV() {
    global.webview.send('clear-apv');
    global.platform.ipc.send('clear-apv');
  },

  sendLine(shabadID, lineID) {
    global.webview.send('show-line', { shabadID, lineID });
    global.platform.ipc.send('show-line', { shabadID, lineID });
  },

  sendText(text, isGurmukhi) {
    global.webview.send('show-text', { text, isGurmukhi });
    global.platform.ipc.send('show-text', { text, isGurmukhi });
  },

  sendScroll(pos) {
    global.platform.ipc.send('send-scroll', { pos });
  },

  'presenter-view': function presenterView() {
    updateViewerScale();
  },

  autoplay() {
    global.core.search.checkAutoPlay();
  },
};
