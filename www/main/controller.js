/* global Mousetrap */
const electron = require('electron');
const anvaad = require('anvaad-js');

const { remote } = electron;
const { app, dialog, Menu } = remote;
const main = remote.require('./app');
const { store, appstore, i18n, isUnsupportedWindow } = main;
const analytics = remote.getGlobal('analytics');
const shortcutFunctions = require('./keyboard-shortcuts/shortcut-functions');
const { changeFontSize, changeVisibility } = require('./quick-tools-utils');

const appName = i18n.t('APPNAME');

global.webview = document.querySelector('webview');

global.webview.addEventListener('dom-ready', () => {
  global.webview.send('is-webview');
});

global.webview.addEventListener('ipc-message', event => {
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

const updateMenu = [];

if (!isUnsupportedWindow) {
  updateMenu.push(
    {
      label: i18n.t('MENU.APP.VERSION', { version: main.appVersion }),
      enabled: false,
    },
    {
      label: i18n.t('MENU.UPDATE.CHECK'),
      accelerator: 'CmdOrCtrl+U',
      click: () => {
        analytics.trackEvent('menu', 'check-update');
        main.checkForUpdates(true);
      },
      // Only show if not in a platform-specific app store
      visible: !appstore,
    },
    {
      label: i18n.t('MENU.UPDATE.CHECKING'),
      enabled: false,
      visible: false,
    },
    {
      label: i18n.t('MENU.UPDATE.DOWNLOADING'),
      enabled: false,
      visible: false,
    },
    {
      label: i18n.t('MENU.UPDATE.INSTALL_AND_RESTART'),
      click: () => {
        analytics.trackEvent('menu', 'install-restart');
        main.autoUpdater.quitAndInstall();
      },
      visible: false,
    },
  );
}

const menuTemplate = [
  {
    label: i18n.t('MENU.EDIT.SELF'),
    submenu: [
      {
        label: i18n.t('MENU.EDIT.UNDO'),
        accelerator: 'CmdOrCtrl+Z',
        role: 'undo',
      },
      {
        label: i18n.t('MENU.EDIT.REDO'),
        accelerator: 'CmdOrCtrl+Shift+Z',
        role: 'redo',
      },
      {
        type: 'separator',
      },
      {
        label: i18n.t('MENU.EDIT.CUT'),
        accelerator: 'CmdOrCtrl+X',
        role: 'cut',
      },
      {
        label: i18n.t('MENU.EDIT.COPY'),
        accelerator: 'CmdOrCtrl+C',
        role: 'copy',
      },
      {
        label: i18n.t('MENU.EDIT.PASTE'),
        accelerator: 'CmdOrCtrl+V',
        role: 'paste',
      },
      {
        label: i18n.t('MENU.EDIT.SELECT_ALL'),
        accelerator: 'CmdOrCtrl+A',
        role: 'selectall',
      },
    ],
  },
  {
    label: i18n.t('MENU.WINDOW.SELF'),
    role: 'window',
    submenu: [
      {
        label: i18n.t('MENU.WINDOW.BANI_OVERLAY'),
        accelerator: 'CmdOrCtrl+O',
        click: () => {
          main.openSecondaryWindow('overlayWindow');
        },
      },
      {
        label: i18n.t('MENU.WINDOW.MINIMIZE'),
        accelerator: 'CmdOrCtrl+M',
        role: 'minimize',
      },
      {
        label: i18n.t('MENU.WINDOW.CLOSE'),
        accelerator: 'CmdOrCtrl+W',
        role: 'close',
      },
    ],
  },
  {
    label: i18n.t('MENU.CAST.SELF'),
    submenu: [
      {
        label: i18n.t('MENU.CAST.SEARCH'),
        click: () => {
          global.webview.send('search-cast');
        },
      },
      {
        label: i18n.t('MENU.CAST.STOP'),
        visible: false,
        click: () => {
          global.webview.send('stop-cast');
        },
      },
    ],
  },
];

const devMenu = [];

if (process.env.NODE_ENV === 'development') {
  devMenu.push({
    label: i18n.t('MENU.DEV.SELF'),
    submenu: [
      {
        label: i18n.t('MENU.DEV.DEVELOPER_TOOLS'),
        accelerator: 'CmdOrCtrl+Alt+I',
        click: () => {
          remote.getCurrentWindow().toggleDevTools();
        },
      },
      {
        label: i18n.t('MENU.DEV.RELOAD'),
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
    label: i18n.t('MENU.FILE'),
    submenu: [
      {
        label: i18n.t('MENU.APP.PREFERENCES'),
        accelerator: 'Ctrl+,',
        click: () => {
          analytics.trackEvent('menu', 'preferences');
          global.core.menu.showSettingsTab(true);
        },
      },
      {
        type: 'separator',
      },
      {
        label: i18n.t('MENU.APP.QUIT'),
        accelerator: 'Ctrl+Q',
        click: () => {
          analytics.trackEvent('menu', 'quit');
          app.quit();
        },
      },
    ],
  },
  ...menuTemplate,
  {
    label: i18n.t('MENU.HELP.SELF'),
    submenu: [
      {
        label: '',
        enabled: false,
      },
      ...updateMenu,
      {
        label: i18n.t('MENU.HELP.GUIDE'),
        click: () => {
          analytics.trackEvent('menu', 'guide');
          main.openSecondaryWindow('helpWindow');
        },
      },
      {
        label: i18n.t('MENU.HELP.SHORTCUT_LEGEND'),
        click: () => {
          analytics.trackEvent('menu', 'shortcut-legend');
          main.openSecondaryWindow('shortcutLegend');
        },
      },
      {
        label: i18n.t('MENU.HELP.CHANGELOG'),
        click: () => {
          analytics.trackEvent('menu', 'changelog');
          main.openSecondaryWindow('changelogWindow');
        },
      },
    ],
  },
  ...devMenu,
  {
    label: i18n.t('MENU.HELP.DONATE'),
    click: () => {
      analytics.trackEvent('menu', 'donate');
      electron.shell.openExternal('https://khalisfoundation.org/donate/');
    },
  },
  {
    label: i18n.t('MENU.WINDOW.BANI_OVERLAY'),
    click: () => {
      main.openSecondaryWindow('overlayWindow');
    },
  },
];

const macMenu = [
  {
    label: appName,
    submenu: [
      {
        label: i18n.t('MENU.APP.ABOUT', { appName }),
        role: 'about',
      },
      ...updateMenu,
      {
        type: 'separator',
      },
      {
        label: i18n.t('MENU.APP.PREFERENCES'),
        accelerator: 'Cmd+,',
        click: () => {
          global.core.menu.showSettingsTab(true);
        },
      },
      {
        type: 'separator',
      },
      {
        label: i18n.t('MENU.APP.SERVICES'),
        role: 'services',
        submenu: [],
      },
      {
        type: 'separator',
      },
      {
        label: i18n.t('MENU.APP.HIDE', { appName }),
        accelerator: 'Cmd+H',
        role: 'hide',
      },
      {
        label: i18n.t('MENU.APP.HIDE_OTHERS'),
        accelerator: 'Cmd+Alt+H',
        role: 'hideothers',
      },
      {
        type: 'separator',
      },
      {
        label: i18n.t('MENU.APP.QUIT', { appName }),
        accelerator: 'CmdOrCtrl+Q',
        click: () => {
          app.quit();
        },
      },
    ],
  },
  ...menuTemplate,
  {
    label: i18n.t('MENU.HELP.SELF'),
    submenu: [
      {
        label: i18n.t('MENU.HELP.GUIDE'),
        click: () => {
          main.openSecondaryWindow('helpWindow');
        },
      },
      {
        label: i18n.t('MENU.HELP.SHORTCUT_LEGEND'),
        click: () => {
          analytics.trackEvent('menu', 'shortcut-legend');
          main.openSecondaryWindow('shortcutLegend');
        },
      },
      {
        label: i18n.t('MENU.HELP.CHANGELOG'),
        click: () => {
          main.openSecondaryWindow('changelogWindow');
        },
      },
      {
        label: i18n.t('MENU.HELP.DONATE'),
        click: () => {
          electron.shell.openExternal('https://khalisfoundation.org/donate/');
        },
      },
    ],
  },
  ...devMenu,
];

const menu = Menu.buildFromTemplate(
  process.platform === 'darwin' || process.platform === 'linux' ? macMenu : winMenu,
);
if (process.platform === 'darwin' || process.platform === 'linux') {
  Menu.setApplicationMenu(menu);
}

// Mousetrap.bindGlobal('mod+,', () => settings.openSettings());
Mousetrap.bindGlobal('mod+q', () => {
  app.quit();
});

const $menuButton = document.querySelector('.menu-button');
$menuButton.addEventListener('contextmenu', e => {
  e.preventDefault();
  e.stopPropagation();
  menu.popup(remote.getCurrentWindow());
});
$menuButton.addEventListener('click', () => {
  const e = $menuButton.ownerDocument.createEvent('MouseEvents');
  e.initMouseEvent(
    'contextmenu',
    true,
    true,
    $menuButton.ownerDocument.defaultView,
    1,
    0,
    0,
    0,
    0,
    false,
    false,
    false,
    false,
    2,
    null,
  );
  return !$menuButton.dispatchEvent(e);
});

function updateViewerScale() {
  if (global.externalDisplay) {
    global.viewer = global.externalDisplay;
  } else {
    global.viewer = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }
  const $fitInsideWindow = document.body.classList.contains('presenter-view')
    ? document.getElementById('navigator')
    : document.body;
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
  const workspaceHeight = '40px';
  if (fitInsideHeight > proposedHeight) {
    scale = fitInsideWidth / global.viewer.width;
    previewStyles += `right: ${fitInsidePadding};`;
    previewStyles += `top: calc(${workspaceHeight} + ${fitInsidePadding} + ${(fitInsideHeight -
      proposedHeight) /
      2}px);`;
    previewWinStyles += `top: calc(${fitInsidePadding} + ${workspaceHeight} + 25px + ${(fitInsideHeight -
      proposedHeight) /
      2}px);`;
  } else {
    scale = fitInsideHeight / global.viewer.height;
    const proposedWidth = fitInsideHeight * viewerRatio;
    previewStyles += `top: calc(${fitInsidePadding} + ${workspaceHeight} );`;
    previewWinStyles += `top: calc(${fitInsidePadding} + 35px);`;
    previewStyles += `right: calc(${fitInsidePadding} + ${(fitInsideWidth - proposedWidth) /
      2}px);`;
  }
  previewStyles += `transform: scale(${scale});`;
  previewStyles = document.createTextNode(
    `.scale-viewer #main-viewer { ${previewStyles} }
    .scale-viewer.win32 #main-viewer { ${previewWinStyles} }`,
  );
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

function checkPresenterView() {
  const inPresenterView = store.getUserPref('app.layout.presenter-view');
  const { classList } = document.body;

  classList.toggle('presenter-view', inPresenterView);
  classList.toggle('home', !inPresenterView);
  classList.toggle('scale-viewer', inPresenterView);

  // hide header-tabs for non presenter view
  document.querySelector('.nav-header-tabs').classList.toggle('hidden', !inPresenterView);
  global.platform.ipc.send('presenter-view', inPresenterView);
  global.webview.send('presenter-view', inPresenterView);
}

function reloadBani(resume = false) {
  const $shabad = document.getElementById('shabad');
  const currentBani = $shabad.dataset.bani;
  const $currentLine = $shabad.querySelector('.current');
  const lineID = resume && $currentLine ? $currentLine.dataset.lineId : null;
  if (currentBani) {
    global.core.search.loadBani(currentBani, lineID);
  }
}

global.platform.ipc.on('presenter-view', () => {
  checkPresenterView();
  updateViewerScale();
});

global.platform.ipc.on('external-display', (e, args) => {
  global.externalDisplay = {
    width: args.width,
    height: args.height,
  };
  checkPresenterView();
  updateViewerScale();
});
global.platform.ipc.on('remove-external-display', () => {
  delete global.externalDisplay;
  document.body.classList.remove(['presenter-view', 'scale-viewer']);
});
window.onresize = () => {
  updateViewerScale();
};

const menuUpdate =
  process.platform === 'darwin' || process.platform === 'linux'
    ? menu.items[0].submenu
    : menu.items[4].submenu;
const menuCast = menu.items[3].submenu;

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

global.platform.ipc.on('shortcuts', (event, arg) => {
  shortcutFunctions[arg.actionName](arg.event);
});

global.platform.ipc.on('cast-session-active', () => {
  menuCast.items[0].visible = false;
  menuCast.items[1].visible = true;

  store.setUserPref('app.layout.presenter-view', true);
  checkPresenterView();
  updateViewerScale();

  store.set('userPrefs.slide-layout.display-options.akhandpaatt', false);
  store.set('userPrefs.slide-layout.display-options.disable-akhandpaatt', true);
  global.webview.send('clear-apv');
  global.platform.ipc.send('clear-apv');

  document.body.classList.remove('akhandpaatt');
  global.core.platformMethod('updateSettings');
  analytics.trackEvent('chromecast', 'start');
});
global.platform.ipc.on('cast-session-stopped', () => {
  menuCast.items[1].visible = false;
  menuCast.items[0].visible = true;
  store.set('userPrefs.slide-layout.display-options.disable-akhandpaatt', false);
});

global.platform.ipc.on('set-user-setting', (event, settingChanger) => {
  if (settingChanger.func === 'size') {
    changeFontSize(settingChanger.iconType, settingChanger.operation === 'plus');
  } else if (settingChanger.func === 'visibility') {
    changeVisibility(settingChanger.iconType);
  }
});

module.exports = {
  clearAPV() {
    global.webview.send('clear-apv');
    global.platform.ipc.send('clear-apv');
  },

  remapLine(rawLine) {
    const Line = { ...rawLine.toJSON() };
    if (Line.Translations) {
      const lineTranslations = JSON.parse(Line.Translations);
      Line.English = lineTranslations.en.bdb;
      Line.Punjabi = lineTranslations.pu.bdb || lineTranslations.pu.ss;
      Line.Spanish = lineTranslations.es.sn;
      Line.Hindi = (lineTranslations.hi && lineTranslations.hi.ss) || '';
    }
    Line.Transliteration = {
      English: anvaad.translit(Line.Gurmukhi || ''),
      Shahmukhi: anvaad.translit(Line.Gurmukhi || '', 'shahmukhi'),
      Devanagari: anvaad.translit(Line.Gurmukhi || '', 'devnagri'),
    };
    Line.Unicode = anvaad.unicode(Line.Gurmukhi || '');
    return Line;
  },

  sendLine(shabadID, lineID, rawLine, rawRows, mode, start, fromScroll) {
    const Line = this.remapLine(rawLine);
    const rows = rawRows.map(row => this.remapLine(row));
    global.webview.send('show-line', { shabadID, lineID, rows, mode });
    const showLinePayload = {
      shabadID,
      lineID,
      Line,
      live: false,
      larivaar: store.get('userPrefs.slide-layout.display-options.larivaar'),
      rows,
      mode,
      fromScroll,
    };
    if (store.getUserPref('app.live-feed-location')) {
      showLinePayload.live = true;
    }
    global.platform.ipc.send('show-line', showLinePayload);
  },

  sendText(text, isGurmukhi, isAnnouncement = false) {
    global.webview.send('show-empty-slide');
    global.webview.send('show-text', {
      unicode: isGurmukhi ? anvaad.unicode(text) : '',
      text,
      isGurmukhi,
      isAnnouncement,
    });
    global.platform.ipc.send('show-empty-slide');
    global.platform.ipc.send('show-text', {
      unicode: isGurmukhi ? anvaad.unicode(text) : '',
      text,
      isGurmukhi,
      isAnnouncement,
    });
  },
  sendScroll(pos) {
    global.platform.ipc.send('send-scroll', { pos });
  },

  'presenter-view': function presenterView() {
    checkPresenterView();
    updateViewerScale();
  },

  'colored-words': function coloredWords() {
    const coloredWordsVal = store.getUserPref('slide-layout.display-options.colored-words');
    store.setUserPref('slide-layout.display-options.gradient-bg', !coloredWordsVal);
  },

  'gradient-bg': function gradientBg() {
    const gradientBgVal = store.getUserPref('slide-layout.display-options.gradient-bg');
    store.setUserPref('slide-layout.display-options.colored-words', !gradientBgVal);
  },

  'bani-length': function gurbaniBaniLength() {
    reloadBani();
  },

  'mangal-position': function gurbaniMangalPosition() {
    reloadBani(true);
  },

  'autoplay-toggle': function autoPlayToggle() {
    global.core.search.checkAutoPlay();
  },

  'live-feed': function livefeed(val) {
    if (val) {
      const path = dialog.showOpenDialogSync({
        defaultPath: remote.app.getPath('desktop'),
        properties: ['openDirectory'],
      });
      if (path) {
        store.set('userPrefs.app.live-feed-location', path[0]);
        const locationLabel = document.querySelectorAll('.control-item#live-feed > .notes');
        for (let i = 0, len = locationLabel.length; i < len; i += 1) {
          locationLabel[i].innerText = path;
        }
      }
    } else {
      store.set('userPrefs.app.live-feed-location', false);
    }
  },
};
