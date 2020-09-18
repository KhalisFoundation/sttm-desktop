const h = require('hyperscript');
const { remote, shell } = require('electron');
const anvaad = require('anvaad-js');
const isOnline = require('is-online');
const Noty = require('noty');
const qrCode = require('qrcode');

const banidb = require('./banidb');
const { tryConnection, onEnd } = require('./share-sync');

// State Variables
let code = '...';
let adminPin = '...';
let adminPinVisible = true;
let isConntected = false;

const { store, i18n } = remote.require('./app');
const analytics = remote.getGlobal('analytics');
const { updateCeremonyThemeTiles } = require('./theme_editor');

const toolbarItems = ['sunder-gutka', 'ceremonies', 'sync-button', 'lock-screen'];
const navLinks = require('./search');

const nitnemBanis = [2, 4, 6, 9, 10, 20, 21, 23];
const popularBanis = [90, 30, 31, 22];
let banisLoaded = false;
let ceremoniesLoaded = false;

const $toolbar = document.querySelector('#toolbar');
const $baniList = document.querySelector('.bani-list');
const $ceremoniesList = document.querySelector('.ceremonies-list');
const $baniExtras = document.querySelector('.bani-extras');
let currentToolbarItem;

const betaLabel = h('div.beta-label', 'BETA');

// helper functions
const toggleOverlayUI = (toolbarItem, show) => {
  if (show) {
    currentToolbarItem = toolbarItem;
  } else {
    currentToolbarItem = null;
  }
  document.querySelectorAll('.base-ui').forEach(uiElement => {
    uiElement.classList.toggle('blur', show);
  });
  document.querySelectorAll('overlay-ui').forEach(uiElement => {
    uiElement.classList.toggle('hidden', show);
  });
  document.querySelectorAll(`.overlay-ui.ui-${toolbarItem}, .common-overlay`).forEach(uiElement => {
    uiElement.classList.toggle('hidden', !show);
  });
};

const qrCodeGenerator = syncCode => {
  const canvas = document.querySelector('canvas.qr-bani-ctrl');
  qrCode.toCanvas(canvas, `https:/sttm.co/control/${syncCode}`, error => {
    if (error) {
      new Noty({
        type: 'error',
        text: `${i18n.t('TOOLBAR.QR_CODE.ERROR')} : ${error}`,
        timeout: 5000,
        modal: true,
      }).show();
    }
  });
};

const setListeners = () => {
  if (window.socket !== undefined) {
    const $shabad = document.getElementById('shabad');
    window.socket.on('data', data => {
      const isPinCorrect = parseInt(data.pin, 10) === adminPin;
      const lineHeight = 35.6; // height of verse in shabad pane, unit: pixels

      const loadVerse = (crossPlatformId, lineCount) => {
        $shabad.parentElement.scrollTo(0, parseInt(lineCount - 1, 10) * lineHeight);
        const currentVerse = document.querySelector(`[data-cp-id = "${crossPlatformId}"]`);
        if (currentVerse) {
          currentVerse.click();
        } else {
          store.set('GlobalState', {
            currentVerseSelector: `[data-cp-id = "${crossPlatformId}"]`,
          });
        }
      };

      /* We need gurmukhi here to add for history support.
      Will no longer be needed when we move to better state management */
      const loadShabad = (shabadId, verseId, gurmukhi) => {
        const currentShabadID = global.core.search.getCurrentShabadId().id;
        const currentVerse = document.querySelector(`#line${verseId}`);
        // If its not new shabad but just a verse change in current shabad
        if (currentShabadID === shabadId && currentVerse) {
          currentVerse.click();
        } else {
          // if its a new shabad load it and add it to history
          global.core.search.loadShabad(shabadId, verseId);
          global.core.search.addToHistory(shabadId, verseId, gurmukhi);
        }
      };

      const loadCeremony = (ceremonyId, crossPlatformId, lineCount) => {
        const currentCeremonyID = global.core.search.getCurrentShabadId().id;
        if (currentCeremonyID === ceremonyId) {
          loadVerse(crossPlatformId, lineCount);
        } else {
          global.core.search.loadCeremony(ceremonyId, null, false, crossPlatformId);
        }
      };

      const loadBani = (BaniId, crossPlatformId, lineCount) => {
        const currentBaniID = global.core.search.getCurrentShabadId().id;
        if (currentBaniID === BaniId) {
          loadVerse(crossPlatformId, lineCount);
        } else {
          global.core.search.loadBani(BaniId, null, false, crossPlatformId);
        }
      };

      const listenerActions = {
        shabad: payload => {
          loadShabad(payload.shabadId, payload.verseId, payload.gurmukhi);
          analytics.trackEvent('controller', 'shabad', `${payload.shabadId}`);
        },
        text: payload =>
          global.controller.sendText(payload.text, payload.isGurmukhi, payload.isAnnouncement),
        'request-control': () => {
          document.body.classList.toggle(`controller-on`, isPinCorrect);
          window.socket.emit('data', {
            host: 'sttm-desktop',
            type: 'response-control',
            success: isPinCorrect,
            settings: {
              fontSizes: store.getUserPref('slide-layout.font-sizes'),
            },
          });

          // if Pin is correct and there is a shabad already in desktop, emit that shabad details.
          if (isPinCorrect) {
            const currentShabad = global.core.search.getCurrentShabadId();
            const currentVerse = document.querySelector(`#shabad .panktee.current`);
            const homeVerse = document.querySelector(`#shabad .panktee.main`);
            let homeId;
            let highlight;

            if (currentShabad.id && currentVerse) {
              if (currentShabad.type === 'shabad') {
                highlight = currentVerse.dataset.lineId;
                homeId = homeVerse.dataset.lineId;
              } else {
                highlight = currentVerse.dataset.cpId;
                homeId = homeVerse.dataset.cpId;
              }

              window.socket.emit('data', {
                type: currentShabad.type,
                host: 'sttm-desktop',
                id: currentShabad.id,
                shabadid: currentShabad.id, // @deprecated
                highlight: parseInt(highlight, 10),
                homeId: parseInt(homeId, 10),
                baniLength: currentShabad.baniLength,
                mangalPosition: currentShabad.mangalPosition,
              });
            }
          }
          analytics.trackEvent(
            'controller',
            'connection',
            isPinCorrect ? 'Connection Succesful' : 'Connection Failed',
          );
        },
        bani: payload => loadBani(payload.baniId, payload.verseId, payload.lineCount),
        ceremony: payload => loadCeremony(payload.ceremonyId, payload.verseId, payload.lineCount),
        settings: payload => {
          const { settings } = payload;
          if (settings.action === 'changeFontSize') {
            global.core.menu.settings.changeFontSize(settings.target, settings.value);
          }
        },
      };

      // if its an event from web and not from desktop itself
      if (data.host !== 'sttm-desktop') {
        listenerActions[isPinCorrect ? data.type : 'request-control'](data);
      }
    });
  }
};

const showSyncError = errorMessage => {
  document.querySelector('.sync-code-label').innerText = errorMessage;
  document.querySelector('.sync-code-num').innerText = '...';
  document.querySelector('.admin-pin').innerText = `${i18n.t('TOOLBAR.SYNC_CONTROLLER.PIN')}: ...`;
  document.querySelector('#tool-sync-button').setAttribute('title', '...');
};

const remoteSyncInit = async () => {
  const $syncConent = document.querySelector('.sync-content-wrapper');
  $syncConent.classList.add('loading');
  const onlineVal = await isOnline();
  if (onlineVal) {
    const newCode = await tryConnection();
    $syncConent.classList.remove('loading');
    if (newCode !== code) {
      document.body.classList.remove('controller-on');
    }
    code = newCode;
    if (code) {
      adminPin = adminPin === '...' ? Math.floor(1000 + Math.random() * 8999) : adminPin;
      document.querySelector('.sync-code-label').innerText = i18n.t(
        'TOOLBAR.SYNC_CONTROLLER.UNIQUE_CODE_LABEL',
      );
      document.querySelector('.sync-code-num').innerText = code;
      document.querySelector('.admin-pin').innerText = adminPinVisible
        ? `${i18n.t('TOOLBAR.SYNC_CONTROLLER.PIN')}: ${adminPin}`
        : '...';
      document.querySelector('#tool-sync-button').setAttribute('title', code);
      qrCodeGenerator(code);
    } else {
      showSyncError(i18n.t('TOOLBAR.SYNC_CONTROLLER.CODE_ERR'));
    }
  } else {
    $syncConent.classList.remove('loading');
    showSyncError(i18n.t('TOOLBAR.SYNC_CONTROLLER.INTERNET_ERR'));
  }
  setListeners();
};

// factories
const navigatorHeaderFactory = (id, content, lang) =>
  h(`header.toolbar-nh.navigator-header#${id}`, h(`span.${lang}`, content));

const blockListFactory = (lang, id) => h('section.blocklist', h(`ul#${id}.${lang}`));

const switchFactory = (id, label, inputId, clickEvent, defaultValue = true) =>
  h(`div.${id}`, [
    h('span', label),
    h('div.switch', [
      h(`input#${inputId}-toggle`, {
        name: inputId,
        type: 'checkbox',
        checked: defaultValue,
        onclick: clickEvent,
        value: inputId,
      }),
      h('label', {
        htmlFor: `${inputId}-toggle`,
      }),
    ]),
  ]);

const syncItemFactory = (title, description, controls) =>
  h('div.sync-item', [
    h('div.sync-item-left', [h('div.sync-item-head', title), h('div.sync-item-desc', description)]),
    h('div.sync-item-right', controls),
  ]);

const syncToggle = async (forceConnect = false) => {
  if (isConntected && !forceConnect) {
    isConntected = false;
    onEnd(code);
    code = '...';
    adminPin = '...';
    const canvas = document.querySelector('.qr-bani-ctrl');
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    document.querySelector('.sync-code-num').innerText = code;
    document.querySelector('.admin-pin').innerText = adminPinVisible
      ? `${i18n.t('TOOLBAR.SYNC_CONTROLLER.PIN')}: ${adminPin}`
      : '';
    document.querySelector('#tool-sync-button').setAttribute('title', ' ');
    document.body.classList.remove('controller-on');
    analytics.trackEvent('syncStopped', true);
  } else {
    isConntected = true;
    await remoteSyncInit();
  }
  document.querySelector('#connection-toggle').checked = !isConntected;
};

const toggleAdminPin = () => {
  if (adminPinVisible) {
    document.querySelector('.admin-pin').innerText = `${i18n.t(
      'TOOLBAR.SYNC_CONTROLLER.PIN',
    )}: ...`;
    document.querySelector('.hide-btn i').classList.replace('fa-eye', 'fa-eye-slash');
    adminPinVisible = false;
  } else {
    document.querySelector('.admin-pin').innerText = `${i18n.t(
      'TOOLBAR.SYNC_CONTROLLER.PIN',
    )}: ${adminPin}`;
    document.querySelector('.hide-btn i').classList.replace('fa-eye-slash', 'fa-eye');
    adminPinVisible = true;
  }
  analytics.trackEvent('controller', 'pinVisibility', adminPinVisible);
};

const toggleLockScreen = () => {
  toggleOverlayUI(currentToolbarItem, false);
  toggleOverlayUI('lock-screen', true);
  analytics.trackEvent('controller', 'screenLock', true);
};

const adminContent = h('div', [
  h('div.large-text', [
    h('span.admin-pin', `${i18n.t('TOOLBAR.SYNC_CONTROLLER.PIN')}: ${adminPin}`),
    h(
      'span.hide-btn',
      {
        onclick: toggleAdminPin,
      },
      h('i.fa.fa-eye'),
    ),
  ]),
  h(
    'button.button.lock-screen-btn',
    {
      onclick: toggleLockScreen,
    },
    'Lock Screen',
  ),
]);

const zoomContent = h('div.zoom-content-wrapper', [
  h('div.zoom-content', [
    h('div.zoom-code-label', i18n.t('TOOLBAR.ZOOM_CC_OVERLAY.INPUT_HELPER')),
    h('div.zoom-form', [
      h('input.zoom-api-input', {
        type: 'text',
        onchange: () => {
          document.querySelector('.save-btn').classList.remove('hidden-btn');
          document.querySelector('.clear-btn').classList.add('hidden-btn');
        },
      }),
      h('button.button.save-btn', [i18n.t('TOOLBAR.ZOOM_CC_OVERLAY.SAVE_BUTTON')], {
        onclick: () => {
          // sets the zoom api token
          const apiCode = document.querySelector('.zoom-api-input').value;
          if (apiCode) {
            store.set('userPrefs.app.zoomToken', apiCode);

            document.querySelector('.save-btn').classList.add('hidden-btn');
            document.querySelector('.clear-btn').classList.remove('hidden-btn');
          }
        },
      }),
      h('button.button.clear-btn.hidden-btn', [i18n.t('TOOLBAR.ZOOM_CC_OVERLAY.CLEAR_BUTTON')], {
        onclick: () => {
          // clears the zoom api token
          document.querySelector('.zoom-api-input').value = '';
          store.set('userPrefs.app.zoomToken', '');
          document.querySelector('.save-btn').classList.remove('hidden-btn');
          document.querySelector('.clear-btn').classList.add('hidden-btn');
        },
      }),
    ]),
    h(
      'button.instructions-btn',
      [
        h('img.play-icon', {
          src: 'assets/img/icons/play-button.svg',
        }),
        h('span', [i18n.t('TOOLBAR.ZOOM_CC_OVERLAY.INSTRUCTIONS_BUTTON')]),
      ],
      {
        onclick: () => {
          shell.openExternal(
            'https://support.khalisfoundation.org/en/support/solutions/articles/63000255302-how-to-use-zoom-overlay-with-sikhitothemax',
          );
        },
      },
    ),
    h('div.quick-container', [
      h('div.quick-title', [i18n.t('TOOLBAR.ZOOM_CC_OVERLAY.INSTRUCTIONS_HEADING')]),
      h('ol.quick-steps', [
        h('li', [i18n.t('TOOLBAR.ZOOM_CC_OVERLAY.INSTRUCTIONS.0')]),
        h('li', [i18n.t('TOOLBAR.ZOOM_CC_OVERLAY.INSTRUCTIONS.1')]),
        h('li', [i18n.t('TOOLBAR.ZOOM_CC_OVERLAY.INSTRUCTIONS.2')]),
        h('li', [i18n.t('TOOLBAR.ZOOM_CC_OVERLAY.INSTRUCTIONS.3')]),
      ]),
    ]),
  ]),
]);

const syncContent = h('div.sync-content-wrapper', [
  h('div.sttm-loader'),
  h('div.sync-content', [
    h('div.sync-code-label', i18n.t('TOOLBAR.SYNC_CONTROLLER.UNIQUE_CODE_LABEL')),
    h('div.sync-code-num', code),
    syncItemFactory(
      i18n.t('TOOLBAR.SYNC_CONTROLLER.SANGAT_SYNC'),
      h('span', [
        i18n.t('TOOLBAR.SYNC_CONTROLLER.SYNC_DESC.1'),
        h('strong', 'sttm.co/sync'),
        i18n.t('TOOLBAR.SYNC_CONTROLLER.SYNC_DESC.2'),
      ]),
      h(
        'button.button.copy-code-btn',
        {
          onclick: () => {
            if (code !== '...') {
              const syncString = i18n.t('TOOLBAR.SYNC_CONTROLLER.SYNC_STRING', { code });
              global.controller.sendText(syncString);
              analytics.trackEvent('controller', 'codePresented', true);
            }
          },
        },
        i18n.t('TOOLBAR.SYNC_CONTROLLER.PRESENT_CODE'),
      ),
    ),
    syncItemFactory(
      i18n.t('TOOLBAR.BANI_CONTROLLER'),
      h('span', [
        i18n.t('TOOLBAR.BANI_DESC.1'),
        h(
          'strong',
          h(
            'a',
            {
              href: 'https:sttm.co/control',
            },
            'sttm.co/control',
          ),
        ),
        i18n.t('TOOLBAR.BANI_DESC.2'),
      ]),
      adminContent,
    ),
    h('div.connection-switch-container', [
      h('p', i18n.t('TOOLBAR.DISABLE_CONNECTIONS_MSG', { appName: i18n.t('APPNAME') })),
      switchFactory(
        'connection-switch',
        '',
        'connection',
        () => {
          syncToggle();
          analytics.trackEvent('controller', 'connection', isConntected ? 'Enabled' : 'Disabled');
        },
        false,
      ),
    ]),
  ]),
  h('div.qr-container', [
    h('div.qr-desc', i18n.t('TOOLBAR.QR_CODE.DESC')),
    h('canvas.qr-bani-ctrl'),
    h('div.qr-title', i18n.t('TOOLBAR.BANI_CONTROLLER')),
  ]),
]);

const translitSwitch = h('div.translit-switch', [
  h('span', 'Abc'),
  h('div.switch', [
    h('input#sg-translit-toggle', {
      name: 'hg-trasnlit-toggle',
      type: 'checkbox',
      onclick: () => {
        $baniList.classList.toggle('translit');
      },
      value: 'sg-translit',
    }),
    h('label', {
      htmlFor: 'sg-translit-toggle',
    }),
  ]),
]);

const baniGroupFactory = baniGroupName => {
  const baniGroupClass = baniGroupName.replace(/ /g, '-');
  const heading = i18n.t(`TOOLBAR.${baniGroupName.replace(/ /g, '_').toUpperCase()}`);
  return h(
    'div.bani-group-container',
    h(`header.bani-group-heading.${baniGroupClass}-heading`, heading),
    h(`div.bani-group.${baniGroupClass}`),
  );
};

const extrasTileFactory = (tileType, row) =>
  h(
    `div.extras-tile.${tileType}`,
    {
      onclick: () => {
        global.core.search.loadBani(row.ID);
        toggleOverlayUI(currentToolbarItem, false);
        analytics.trackEvent('sunderGutkaBanis', tileType, row.Token);
        navLinks.navPage('shabad');
        global.core.copy.loadFromDB(row.ID, 'bani');
      },
    },
    h('div.gurmukhi', row.Gurmukhi),
  );

const closeOverlayUI = h(
  'div.close-overlay-ui.overlay-ui.common-overlay.hidden',
  {
    onclick: () => {
      toggleOverlayUI(currentToolbarItem, false);
    },
  },
  h('i.fa.fa-times'),
);

const getEnglishExp = token => {
  const englishExpVal = store.getUserPref(`gurbani.ceremonies.ceremony-${token}-english`);
  if (englishExpVal === undefined) {
    return true;
  }
  return englishExpVal;
};

const printCeremonies = rows => {
  rows.forEach(row => {
    if (row.Token === 'anandkaraj') {
      const $ceremony = h(
        `div.ceremony-pane#${row.Token}`,
        {
          onclick: () => {
            analytics.trackEvent('ceremony', row.Token);
            global.core.search.loadCeremony(row.ID).catch(error => {
              analytics.trackEvent('ceremonyFailed', row.ID, error);
            });
            global.core.copy.loadFromDB(row.ID, 'ceremony');
            const currentCeremony = document.querySelector('div.ceremony-pane.active');
            if (currentCeremony) {
              currentCeremony.classList.remove('active');
            }
            document.querySelector(`div.ceremony-pane#${row.Token}`).classList.add('active');
          },
        },
        navigatorHeaderFactory(row.Token, row.Gurmukhi, 'gurmukhi'),
        h(
          'div.ceremony-pane-content',
          h(
            `div.ceremony-pane-options#cpo-${row.Token}`,
            switchFactory(
              `${row.Token}-english-exp-switch`,
              i18n.t('TOOLBAR.ENG_EXPLANATIONS'),
              `${row.Token}-english-exp`,
              () => {
                const englishExpVal = getEnglishExp(row.Token);
                store.setUserPref(
                  `gurbani.ceremonies.ceremony-${row.Token}-english`,
                  !englishExpVal,
                );
                global.platform.updateSettings();
              },
              getEnglishExp(row.Token),
            ),
          ),
          h(
            `div.ceremony-pane-themes#${row.Token}`,
            {
              onclick: () => {
                toggleOverlayUI(currentToolbarItem, false);
              },
            },
            h('div.ceremony-theme-header', i18n.t('TOOLBAR.CHOOSE_THEME')),
          ),
        ),
      );
      $ceremoniesList.appendChild($ceremony);
    }
  });
};

const printBanis = rows => {
  const banisListID = 'sunder-gutka-banis';
  $baniList.appendChild(blockListFactory('gurmukhi', banisListID));
  const $sunderGutkaBanis = document.querySelector(`#${banisListID}`);
  const $nitnemBanis = document.querySelector('.nitnem-banis');
  const $popularBanis = document.querySelector('.popular-banis');

  rows.forEach(row => {
    let baniTag = 'none';
    if (nitnemBanis.includes(row.ID)) {
      baniTag = 'nitnem';
      $nitnemBanis.appendChild(extrasTileFactory('nitnem-bani', row));
    }
    if (popularBanis.includes(row.ID)) {
      baniTag = 'popular';
      $popularBanis.appendChild(extrasTileFactory('popular-bani', row));
    }
    const $bani = h(
      'li.sunder-gutka-bani',
      {
        onclick: () => {
          analytics.trackEvent('sunderGutkaBanis', row.Token);
          global.core.search.loadBani(row.ID);
          global.core.copy.loadFromDB(row.ID, 'bani');
          toggleOverlayUI(currentToolbarItem, false);
          navLinks.navPage('shabad');
        },
      },
      h(`span.tag.tag-${baniTag}`),
      h('span.gurmukhi.gurmukhi-bani', row.Gurmukhi),
      h('span.translit-bani', anvaad.translit(row.Gurmukhi)),
    );
    $sunderGutkaBanis.appendChild($bani);
  });
};

const toolbarItemFactory = toolbarItem =>
  h(`div.toolbar-item#tool-${toolbarItem}`, {
    onclick: () => {
      if (currentToolbarItem === toolbarItem) {
        toggleOverlayUI(currentToolbarItem, false);
      } else {
        toggleOverlayUI(currentToolbarItem, false);
        const { databaseState } = global.core.search.$search.dataset;
        if (databaseState === 'loaded') {
          toggleOverlayUI(toolbarItem, true);
          if (!banisLoaded) {
            banidb.loadBanis().then(rows => {
              printBanis(rows);
              banisLoaded = !!rows;
            });

            analytics.trackEvent('banisLoaded', true);
          }

          if (!ceremoniesLoaded) {
            banidb.loadCeremonies().then(rows => {
              printCeremonies(rows);
              updateCeremonyThemeTiles();
              ceremoniesLoaded = !!rows;
            });

            analytics.trackEvent('ceremoniesLoaded', true);
          }
        }
      }
    },
  });

module.exports = {
  init() {
    document.querySelector('.focus-overlay').addEventListener('click', () => {
      toggleOverlayUI(currentToolbarItem, false);
    });

    toolbarItems.forEach(toolbarItem => {
      $toolbar.appendChild(toolbarItemFactory(toolbarItem));
    });

    document.querySelector('#tool-sync-button').appendChild(betaLabel);

    document.querySelector('.zoom-dialogue').appendChild(zoomContent);
    document.querySelector('.sync-dialogue').appendChild(syncContent);

    const syncButton = document.querySelector('#tool-sync-button');

    syncButton.addEventListener('click', () => {
      analytics.trackEvent('syncStarted', true);
      syncToggle(true);
    });

    const syncDialogueWrapper = document.querySelector('.sync-dialogue-wrapper');
    syncDialogueWrapper.addEventListener('click', event => {
      if (event.target === event.currentTarget) {
        toggleOverlayUI(currentToolbarItem, false);
      }
    });

    $baniList.querySelector('header').appendChild(translitSwitch);
    $baniExtras.appendChild(baniGroupFactory('nitnem banis'));
    $baniExtras.appendChild(baniGroupFactory('popular banis'));
    $toolbar.appendChild(closeOverlayUI);
  },
};
