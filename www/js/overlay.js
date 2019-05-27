const electron = require('electron');
const h = require('hyperscript');
const ip = require('ip');
const copy = require('copy-to-clipboard');

const host = ip.address();

const { ipcRenderer, remote } = electron;

const overlayPort = remote.getGlobal('overlayPort');

const { store } = remote.require('./app');
const analytics = remote.getGlobal('analytics');

const { overlayVars } = store.get('obs').overlayPrefs;

const url = `http://${host}:${overlayPort}/`;

const savePrefs = () => {
  store.set('obs', {
    overlayPrefs: {
      overlayVars,
    },
  });
  ipcRenderer.send('update-overlay-vars');
};

const colorInputFactory = (inputName, label, defaultColor, onchangeAction) =>
  h(
    `div.${inputName}.input-wrap`,
    h(`input.${inputName}.color-input`, {
      type: 'color',
      onchange: onchangeAction,
      value: defaultColor,
    }),
    h('div.setting-label', label),
  );

const changeColor = e => {
  const color = e.target.value;
  overlayVars.textColor = color;
  savePrefs();
};

const changeGurbaniColor = e => {
  const color = e.target.value;
  overlayVars.gurbaniTextColor = color;
  savePrefs();
};

const changeBg = e => {
  const color = e.target.value;
  overlayVars.bgColor = color;
  savePrefs();
};

const increaseBarSize = () => {
  const size = overlayVars.padding;
  const newSize = size < 5 ? size + 0.1 : 5;

  overlayVars.padding = newSize;
  savePrefs();
};
const decreaseBarSize = () => {
  const size = overlayVars.padding;
  const newSize = size > 0.5 ? size - 0.1 : 0.5;

  overlayVars.padding = newSize;
  savePrefs();
};

const increasefontSize = () => {
  const size = overlayVars.fontSize;
  const newSize = size < 14 ? size + 0.25 : 14;
  overlayVars.fontSize = newSize;
  savePrefs();
};
const decreasefontSize = () => {
  const size = overlayVars.fontSize;
  const newSize = size > 1 ? size - 0.25 : 1;

  overlayVars.fontSize = newSize;
  savePrefs();
};

const increaseGurbanifontSize = () => {
  const size = overlayVars.gurbaniFontSize;
  const newSize = size < 15 ? size + 0.25 : 15;
  overlayVars.gurbaniFontSize = newSize;
  savePrefs();
};
const decreaseGurbanifontSize = () => {
  const size = overlayVars.gurbaniFontSize;
  const newSize = size > 1 ? size - 0.25 : 1;

  overlayVars.gurbaniFontSize = newSize;
  savePrefs();
};

const increaseOpacity = () => {
  const opacity = overlayVars.bgOpacity;
  const newSize = opacity > 0.9 ? 1 : opacity + 0.1;

  overlayVars.bgOpacity = newSize;
  savePrefs();
};
const decreaseOpacity = () => {
  const opacity = overlayVars.bgOpacity;
  const newSize = opacity < 0.1 ? 0 : opacity - 0.1;

  overlayVars.bgOpacity = newSize;
  savePrefs();
};

const separator = h('div.separator');

const layoutButtonFactory = layoutName =>
  h(
    'div.input-wrap',
    h(
      `div.layout-btn.${layoutName}`,
      h('div.layout-bar.layout-bar-1'),
      h('div.layout-bar.layout-bar-2'),
      h('div.layout-bar.layout-bar-3'),
      h('div.layout-bar.layout-bar-4'),
      {
        onclick: () => {
          document.querySelectorAll('.content-bar').forEach(bar => {
            bar.style.transform = 'none'; // eslint-disable-line no-param-reassign
          });
          overlayVars.layout = layoutName;
          savePrefs();
          analytics.trackEvent('overlay', 'layout', layoutName);
        },
      },
    ),
  );

const resizeButtonFactory = (increaseFunc, decreaseFunc) =>
  h(
    'div.input-wrap.resize-btn',
    h(
      'span.export-btn',
      {
        onclick: () => {
          decreaseFunc();
        },
      },
      h('i.fa.fa-minus-circle.cp-icon'),
    ),
    h(
      'span.export-btn',
      {
        onclick: () => {
          increaseFunc();
        },
      },
      h('i.fa.fa-plus-circle.cp-icon'),
    ),
  );

const copyURLButton = h(
  'div.input-wrap',
  {
    title: `${url}`,
    onclick: () => {
      copy(url);
    },
  },
  h('div.export-btn', h('i.fa.fa-files-o.cp-icon')),
  h('div.setting-label', 'Copy URL'),
);

const toggleLarivaar = h(
  'div.input-wrap',
  {
    onclick: evt => {
      overlayVars.overlayLarivaar = !overlayVars.overlayLarivaar;
      savePrefs();

      const isLarivaar = overlayVars.overlayLarivaar;

      const $larivaarIcon = evt.currentTarget.querySelector('.cp-icon');
      $larivaarIcon.classList.toggle('fa-unlink', isLarivaar);
      $larivaarIcon.classList.toggle('fa-link', !isLarivaar);

      const $larivaarLabel = evt.currentTarget.querySelector('.setting-label');
      $larivaarLabel.innerText = `Use ${isLarivaar ? 'Padched' : 'Larivaar'}`;
    },
  },
  h(
    'div.export-btn#larivaar-btn',
    h(`i.fa.cp-icon.${overlayVars.overlayLarivaar ? 'fa-unlink' : 'fa-link'}`),
  ),
  h('div.setting-label', `Use ${overlayVars.overlayLarivaar ? 'Padched' : 'Larivaar'}`),
);

const topLayoutBtn = layoutButtonFactory('top');
const bottomLayoutBtn = layoutButtonFactory('bottom');
const splitLayoutBtn = layoutButtonFactory('split');
const gurbaniColor = colorInputFactory(
  'toggle-text',
  'Gurbani',
  overlayVars.gurbaniTextColor,
  changeGurbaniColor,
);
const textColor = colorInputFactory('toggle-text', 'Text', overlayVars.textColor, changeColor);
const backgroundColor = colorInputFactory('background', 'BG', overlayVars.bgColor, changeBg);
const changeBarSizeButton = resizeButtonFactory(increaseBarSize, decreaseBarSize);
const changefontSizeButton = resizeButtonFactory(increasefontSize, decreasefontSize);
const changeGurbanifontSizeButton = resizeButtonFactory(
  increaseGurbanifontSize,
  decreaseGurbanifontSize,
);
const changeOpacityButton = resizeButtonFactory(increaseOpacity, decreaseOpacity);

const controlPanel = document.querySelector('.control-panel');
const themeSelector = document.querySelector('.theme-selector');

controlPanel.append(gurbaniColor);
controlPanel.append(changeGurbanifontSizeButton);
controlPanel.append(textColor);
controlPanel.append(changefontSizeButton);
controlPanel.append(separator);
controlPanel.append(backgroundColor);
controlPanel.append(changeBarSizeButton);
controlPanel.append(h('div.setting-label', 'Size'));
controlPanel.append(changeOpacityButton);
controlPanel.append(h('div.setting-label', 'Opacity'));
controlPanel.append(separator.cloneNode(true));
controlPanel.append(bottomLayoutBtn);
controlPanel.append(topLayoutBtn);
controlPanel.append(splitLayoutBtn);
controlPanel.append(separator.cloneNode(true));
controlPanel.append(copyURLButton);
controlPanel.append(toggleLarivaar);

const themeObjects = {
  aNewDay: {
    label: 'a new day',
    bgColor: '#97d6f7',
    textColor: '#003a8c',
    gurbaniTextColor: '#0e2654',
  },
  baagiBlue: {
    label: 'baagi blue',
    bgColor: '#274f69',
    textColor: '#fff',
    gurbaniTextColor: '#fff',
  },
  khalsaRush: {
    label: 'khalsa rush',
    bgColor: '#ffa61a',
    textColor: '#071f77',
    gurbaniTextColor: '#071f77',
  },
  moodyBlue: {
    label: 'moody blue',
    bgColor: '#2d73a7',
    textColor: '#fff',
    gurbaniTextColor: '#fff',
  },
  blackAndBlue: {
    label: 'black and blue',
    bgColor: '#000',
    textColor: '#a3eafd',
    gurbaniTextColor: '#fff',
  },
  floral: {
    label: 'floral',
    bgColor: '#f5b7d1',
    textColor: '#a3eafd',
    gurbaniTextColor: '#fff',
  },
  khalsaGold: {
    label: 'khalsa gold',
    bgColor: '#58330a',
    textColor: '#ffba00',
    gurbaniTextColor: '#ffba00',
  },
  neverForget: {
    label: 'never forget',
    bgColor: '#000',
    textColor: '#f00',
    gurbaniTextColor: '#f00',
  },
};

const themeSwatchFactory = themeOptions => {
  const themeClass = themeOptions.label
    .toLowerCase()
    .split(' ')
    .join('-');

  return h(
    `div.overlay-theme-swatch.${themeClass}`,
    {
      onclick: () => {
        overlayVars.theme = themeClass;
        overlayVars.textColor = themeOptions.textColor;
        overlayVars.gurbaniTextColor = themeOptions.gurbaniTextColor;
        overlayVars.bgColor = themeOptions.bgColor;
        savePrefs();
      },
    },
    h('span', themeOptions.label),
  );
};

themeSelector.appendChild(h('div.theme-selector-header', 'Presets'));

Object.keys(themeObjects).forEach(themeObject => {
  themeSelector.appendChild(themeSwatchFactory(themeObjects[themeObject]));
});

const webview = document.createElement('webview');
webview.src = `${url}?preview`;
webview.className = 'preview';
document.querySelector('.canvas').appendChild(webview);

// Migrate older preferences
if (!overlayVars.padding || overlayVars.fontSize > 14 || overlayVars.gurbaniFontSize > 15) {
  if (typeof overlayVars.padding === 'undefined') {
    overlayVars.padding = 0.5;
  }
  if (overlayVars.fontSize > 14) {
    overlayVars.fontSize = 3;
  }
  if (overlayVars.gurbaniFontSize > 15) {
    overlayVars.gurbaniFontSize = 5;
  }
  savePrefs();
}
