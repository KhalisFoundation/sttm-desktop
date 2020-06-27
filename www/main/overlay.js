const electron = require('electron');
const h = require('hyperscript');
const ip = require('ip');
const copy = require('copy-to-clipboard');
// eslint-disable-next-line import/no-unresolved
const { obs: defaultPrefs } = require('./configs/defaults.json');

const { ipcRenderer, remote } = electron;

const { store, i18n } = remote.require('./app');
const analytics = remote.getGlobal('analytics');

const { fonts, overlayVars } = store.get('obs').overlayPrefs;
let overlayCast = store.getUserPref('app.overlay-cast');
let announcementOverlay = store.getUserPref('app.announcement-overlay');

const controlPanel = document.querySelector('.control-panel');
const textControls = document.querySelector('.text-controls');
const webview = document.createElement('webview');

const getUrl = () => {
  const overlayPort = remote.getGlobal('overlayPort');
  const host = ip.address();
  return `http://${host}:${overlayPort}/`;
};

let url = getUrl();

const savePrefs = () => {
  store.set('obs', {
    overlayPrefs: {
      overlayVars,
    },
  });
  ipcRenderer.send('update-overlay-vars');
};

const colorInputFactory = (inputName, defaultColor, onchangeAction) =>
  h(
    `div.${inputName}.input-wrap`,
    h(`input.${inputName}.color-input`, {
      type: 'color',
      onchange: onchangeAction,
      value: defaultColor,
    }),
  );

const controlsFactory = (controls, label) =>
  h('div.toggle-text', controls, h('div.setting-label', label));

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

const setToggleIcon = (el, flag, classes = ['fa-toggle-on', 'fa-toggle-off']) => {
  const $icon = el.querySelector('.cp-icon');
  $icon.classList.toggle(classes[0], flag);
  $icon.classList.toggle(classes[1], !flag);
};

const separator = h('div.separator');
const separatorY = () => h('div.separator-y').cloneNode(true);

const layoutButtonFactory = layoutName =>
  h(
    `div.layout-btn.${layoutName}`,
    h('div.layout-bar.layout-bar-1'),
    h('div.layout-bar.layout-bar-2'),
    h('div.layout-bar.layout-bar-3'),
    h('div.layout-bar.layout-bar-4'),
    h('div.layout-vertical-bar'),
    h('div.layout-classic-bar'),
    {
      onclick: () => {
        document.querySelectorAll('.content-bar').forEach(bar => {
          bar.setAttribute('style', 'transform:none');
        });
        const prevLayout = overlayVars.layout;
        overlayVars.layout = layoutName;
        if (layoutName === 'vertical') {
          overlayVars.layout = prevLayout === 'vertical' ? 'vertical-left' : 'vertical';
          document
            .querySelector('.layout-btn.vertical')
            .classList.toggle('vertical-left', overlayVars.layout === 'vertical-left');
        }
        savePrefs();
        analytics.trackEvent('overlay', 'layout', layoutName);
      },
    },
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

const closeAllDropDowns = () => {
  document
    .querySelectorAll('.options-container.visible')
    .forEach(el => el.classList.remove('visible'));
};

const toggleDropDown = $select => {
  closeAllDropDowns();
  const $options = $select.querySelector('.options-container');
  $options.classList.add('visible');
  $options.style.top = `${
    window.innerHeight < $options.offsetHeight + $select.offsetTop
      ? -$options.offsetHeight
      : $select.querySelector('.select-value').offsetHeight
  }px`;
};

window.addEventListener('click', e => {
  if (!e.target.classList.contains('select-value')) {
    closeAllDropDowns();
  } else {
    toggleDropDown(e.target.parentElement);
  }
});

const fontSwitch = (e, font, propName) => {
  e.target.parentElement.parentElement.querySelector('.select-value').innerHTML = font;
  overlayVars[propName] = font;
  savePrefs();
};

const fontListFactory = (list, propName) => {
  const options = list.map(font =>
    h(`div.option`, { onclick: e => fontSwitch(e, font, propName) }, font),
  );
  return h(
    'div.custom-select',
    h(`div.select-value.${propName}`, overlayVars[propName]),
    h('div.options-container', options),
  );
};

const copyURLButton = h(
  'span.input-wrap',
  {
    title: `${url}`,
    onclick: () => {
      copy(url);
      analytics.trackEvent('overlay', 'urlCopied', url);
    },
  },
  h('span.export-btn', { title: i18n.t('BANI_OVERLAY.COPY_URL') }, h('i.fa.fa-files-o.cp-icon')),
);

const overlayUrl = () =>
  h(
    'div.url-container',
    h('input.url-text', { type: 'text', readOnly: true, value: `${overlayCast ? getUrl() : ''}` }),
    copyURLButton,
  );

const changeOpacityButton = resizeButtonFactory(increaseOpacity, decreaseOpacity);
const opacityControls = controlsFactory(changeOpacityButton, i18n.t('BANI_OVERLAY.OPACITY'));
opacityControls.style.display = overlayVars.greenScreen ? 'none' : 'inline-block';

const toggleLarivaarAssist = h(
  'div.input-wrap.larivaar-assist-toggle',
  {
    onclick: evt => {
      if (overlayCast) {
        overlayVars.larivaarAssist = !overlayVars.larivaarAssist;
        savePrefs();
        const { larivaarAssist } = overlayVars;

        const $logoIcon = evt.currentTarget.querySelector('.cp-icon');
        $logoIcon.classList.toggle('fa-toggle-on', larivaarAssist);
        $logoIcon.classList.toggle('fa-toggle-off', !larivaarAssist);

        analytics.trackEvent('overlay', 'toggleLogo', larivaarAssist);
      }
    },
  },
  h(
    'div#logo-btn',
    h(`i.fa.cp-icon.${overlayVars.larivaarAssist ? 'fa-toggle-on' : 'fa-toggle-off'}`),
  ),
  h('div.setting-label', 'Larivaar Assist'),
);

const resetButton = h(
  'div.input-wrap',
  {
    onclick: () => {
      const { overlayVars: defaultVars } = defaultPrefs.overlayPrefs;
      Object.assign(overlayVars, defaultVars);
      savePrefs();

      const { overlayLogo, overlayLarivaar } = overlayVars;
      const $logoEl = document.querySelector('div.input-wrap.logo-toggle');
      const $larivaarEl = document.querySelector('div.input-wrap.larivaar');

      document.querySelector('input.toggle-gurbani-text').value = overlayVars.textColor;
      document.querySelector('input.toggle-text').value = overlayVars.gurbaniTextColor;
      document.querySelector('input.background').value = overlayVars.bgColor;

      setToggleIcon($logoEl, overlayLogo);
      setToggleIcon($larivaarEl, overlayLarivaar, ['fa-link', 'fa-unlink']);

      const $larivaarLabel = $larivaarEl.querySelector('.setting-label');
      $larivaarLabel.innerText = `Use ${overlayLarivaar ? 'Padched' : 'Larivaar'}`;
    },
  },
  h('div.export-btn', h('i.fa.fa-refresh.cp-icon')),
  h('div.setting-label', 'Reset Settings'),
);

const toggleLarivaar = h(
  'div.input-wrap.larivaar',
  {
    onclick: evt => {
      overlayVars.overlayLarivaar = !overlayVars.overlayLarivaar;
      savePrefs();

      const isLarivaar = overlayVars.overlayLarivaar;
      setToggleIcon(evt.currentTarget, isLarivaar, ['fa-link', 'fa-unlink']);
      controlPanel[isLarivaar ? 'appendChild' : 'removeChild'](toggleLarivaarAssist);

      const $larivaarIcon = evt.currentTarget.querySelector('.cp-icon');
      $larivaarIcon.classList.toggle('fa-unlink', isLarivaar);
      $larivaarIcon.classList.toggle('fa-link', !isLarivaar);

      const $larivaarLabel = evt.currentTarget.querySelector('.setting-label');
      $larivaarLabel.innerText = `Use ${
        isLarivaar ? i18n.t('BANI_OVERLAY.PADCHED') : i18n.t('BANI_OVERLAY.LARIVAAR')
      }`;
    },
  },
  h(
    'div.export-btn#larivaar-btn',
    h(`i.fa.cp-icon.${overlayVars.overlayLarivaar ? 'fa-unlink' : 'fa-link'}`),
  ),
  h(
    'div.setting-label',
    `Use ${
      overlayVars.overlayLarivaar ? i18n.t('BANI_OVERLAY.PADCHED') : i18n.t('BANI_OVERLAY.LARIVAAR')
    }`,
  ),
);

const toggleCast = h(
  'div.input-wrap.cast-toggle',
  {
    onclick: evt => {
      overlayCast = !overlayCast;
      store.setUserPref('app.overlay-cast', overlayCast);
      ipcRenderer.send('toggle-obs-cast', overlayCast);
      ipcRenderer.send('update-settings');

      setToggleIcon(evt.currentTarget, overlayCast);
      document.body.classList.toggle('overlay-off', !overlayCast);

      const $castLabel = evt.currentTarget.querySelector('.setting-label');
      $castLabel.innerText = `${overlayCast ? 'Overlay On' : 'Overlay Off'}`;
      analytics.trackEvent('overlay', 'toggleCast', overlayCast);

      const $copyURLText = document.querySelector('.url-text');

      url = getUrl();
      webview.src = `${url}?preview`;
      $copyURLText.value = overlayCast ? url : '';
    },
  },
  h('div#cast-btn', h(`i.fa.cp-icon.${overlayCast ? 'fa-toggle-on' : 'fa-toggle-off'}`)),
  h(
    'div.setting-label',
    `${overlayCast ? i18n.t('BANI_OVERLAY.OVERLAY_ON') : i18n.t('BANI_OVERLAY.OVERLAY_OFF')}`,
  ),
);

const toggleLogo = h(
  'div.input-wrap.logo-toggle',
  {
    onclick: evt => {
      if (overlayCast) {
        overlayVars.overlayLogo = !overlayVars.overlayLogo;
        savePrefs();
        const { overlayLogo } = overlayVars;

        setToggleIcon(evt.currentTarget, overlayLogo);

        analytics.trackEvent('overlay', 'toggleLogo', overlayLogo);
      }
    },
  },
  h(
    'div#logo-btn',
    h(`i.fa.cp-icon.${overlayVars.overlayLogo ? 'fa-toggle-on' : 'fa-toggle-off'}`),
  ),
  h('div.setting-label', i18n.t('BANI_OVERLAY.LOGO')),
);

const toggleAnnouncements = h(
  'div.input-wrap.announcement-toggle',
  {
    onclick: evt => {
      if (overlayCast) {
        announcementOverlay = !announcementOverlay;
        store.setUserPref('app.announcement-overlay', announcementOverlay);
        ipcRenderer.send('update-settings');

        setToggleIcon(evt.currentTarget, announcementOverlay);

        analytics.trackEvent('overlay', 'toggleAnnouncements', announcementOverlay);
      }
    },
  },
  h(
    'div#announcement-btn',
    h(`i.fa.cp-icon.${announcementOverlay ? 'fa-toggle-on' : 'fa-toggle-off'}`),
  ),
  h('div.setting-label', i18n.t('BANI_OVERLAY.ANNOUNCEMENT')),
);

const toggleGreenScreen = h(
  'div.input-wrap.green-screen-toggle',
  {
    onclick: evt => {
      if (overlayCast) {
        overlayVars.greenScreen = !overlayVars.greenScreen;
        savePrefs();
        const { greenScreen } = overlayVars;

        setToggleIcon(evt.currentTarget, greenScreen);
        opacityControls.style.display = greenScreen ? 'none' : 'inline-block';
        analytics.trackEvent('overlay', 'toggleGreenScreen', greenScreen);
      }
    },
  },
  h(
    'div#green-screen-btn',
    h(`i.fa.cp-icon.${overlayVars.greenScreen ? 'fa-toggle-on' : 'fa-toggle-off'}`),
  ),
  h('div.setting-label', i18n.t('BANI_OVERLAY.GREEN_SCREEN')),
);

/** Main Control Bar Items */
controlPanel.append(toggleCast);
controlPanel.append(toggleLogo);
controlPanel.append(toggleAnnouncements);
controlPanel.append(toggleGreenScreen);
controlPanel.append(separator);
controlPanel.append(resetButton);
controlPanel.append(toggleLarivaar);
if (overlayVars.overlayLarivaar) {
  controlPanel.appendChild(toggleLarivaarAssist);
}

/** Text Control Bar Items */
const topLayoutBtn = layoutButtonFactory('top');
const bottomLayoutBtn = layoutButtonFactory('bottom');
const splitLayoutBtn = layoutButtonFactory('split');
const verticalLayoutBtn = layoutButtonFactory('vertical');
const classicLayoutBtn = layoutButtonFactory('classic');

const gurbaniColor = colorInputFactory(
  'toggle-gurbani-text',
  overlayVars.gurbaniTextColor,
  changeGurbaniColor,
);
const textColor = colorInputFactory('toggle-text', overlayVars.textColor, changeColor);
const backgroundColor = colorInputFactory('background', overlayVars.bgColor, changeBg);
const changeBarSizeButton = resizeButtonFactory(increaseBarSize, decreaseBarSize);
const changefontSizeButton = resizeButtonFactory(increasefontSize, decreasefontSize);
const changeGurbanifontSizeButton = resizeButtonFactory(
  increaseGurbanifontSize,
  decreaseGurbanifontSize,
);

const translationFonts = fontListFactory(fonts.translation, 'translationFont');
const gurbaniFonts = fontListFactory(fonts.gurbani, 'gurbaniFont');

textControls.append(
  controlsFactory(
    [gurbaniColor, gurbaniFonts, changeGurbanifontSizeButton],
    i18n.t('BANI_OVERLAY.GURBANI'),
  ),
);
textControls.append(separatorY());
textControls.append(
  controlsFactory([textColor, translationFonts, changefontSizeButton], i18n.t('BANI_OVERLAY.TEXT')),
);
textControls.append(separatorY());
textControls.append(controlsFactory(backgroundColor, i18n.t('BANI_OVERLAY.BG')));
textControls.append(separatorY());
textControls.append(controlsFactory(changeBarSizeButton, i18n.t('BANI_OVERLAY.SIZE')));
textControls.append(opacityControls);
textControls.append(separatorY());
textControls.append(
  controlsFactory(
    [topLayoutBtn, bottomLayoutBtn, splitLayoutBtn, verticalLayoutBtn, classicLayoutBtn],
    i18n.t('BANI_OVERLAY.LAYOUT'),
  ),
);

document
  .querySelector('.layout-btn.vertical')
  .classList.toggle('vertical-left', overlayVars.layout === 'vertical-left');

const themeSelector = document.querySelector('.theme-selector');

const themeObjects = {
  aNewDay: {
    label: 'A_NEW_DAY',
    bgColor: '#97d6f7',
    textColor: '#003a8c',
    gurbaniTextColor: '#0e2654',
  },
  baagiBlue: {
    label: 'BAAGI_BLUE',
    bgColor: '#274f69',
    textColor: '#ffffff',
    gurbaniTextColor: '#ffffff',
  },
  khalsaRush: {
    label: 'KHALSA_RUSH',
    bgColor: '#ffa61a',
    textColor: '#071f77',
    gurbaniTextColor: '#071f77',
  },
  moodyBlue: {
    label: 'MOODY_BLUE',
    bgColor: '#2d73a7',
    textColor: '#ffffff',
    gurbaniTextColor: '#ffffff',
  },
  blackAndBlue: {
    label: 'BLACK_&_BLUE',
    bgColor: '#000000',
    textColor: '#a3eafd',
    gurbaniTextColor: '#ffffff',
  },
  floral: {
    label: 'FLORAL',
    bgColor: '#f5b7d1',
    textColor: '#a3eafd',
    gurbaniTextColor: '#ffffff',
  },
  khalsaGold: {
    label: 'KHALSA_GOLD',
    bgColor: '#58330a',
    textColor: '#ffba00',
    gurbaniTextColor: '#ffba00',
  },
  neverForget: {
    label: 'NEVER_FORGET',
    bgColor: '#000000',
    textColor: '#ff0000',
    gurbaniTextColor: '#ff0000',
  },
};

const updateColorInputs = () => {
  document.querySelector('input.toggle-gurbani-text').value = overlayVars.gurbaniTextColor;
  document.querySelector('input.toggle-text').value = overlayVars.textColor;
  document.querySelector('input.background').value = overlayVars.bgColor;
};

const themeSwatchFactory = themeOptions => {
  const themeClass = i18n
    .t(`THEMES.${themeOptions.label}`)
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
        updateColorInputs();

        analytics.trackEvent('overlay', 'theme', overlayVars.theme);
      },
    },
    h('span', i18n.t(`THEMES.${themeOptions.label}`)),
  );
};

themeSelector.appendChild(h('div.theme-selector-header', i18n.t('BANI_OVERLAY.PRESETS')));

document.body.classList.toggle('overlay-off', !overlayCast);

Object.keys(themeObjects).forEach(themeObject => {
  themeSelector.appendChild(themeSwatchFactory(themeObjects[themeObject]));
});

webview.src = `${url}?preview`;
webview.className = 'preview';
const preview = document.querySelector('.preview-container');
preview.prepend(webview);
preview.append(overlayUrl());

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
