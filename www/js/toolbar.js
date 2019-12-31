const h = require('hyperscript');
const { remote } = require('electron');
const anvaad = require('anvaad-js');
const isOnline = require('is-online');
const banidb = require('./banidb');
const { tryConnection, onEnd } = require('./share-sync');

let isConnected = {
  admin: false,
  sync: false,
};

const { store } = remote.require('./app');
const analytics = remote.getGlobal('analytics');
const { updateCeremonyThemeTiles } = require('./theme_editor');

const toolbarItems = ['sunder-gutka', 'ceremonies', 'sync-button'];
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

let codes = {
  sync: '...',
  admin: '...',
};

const betaLabel = h('div.beta-label', 'BETA');

// helper functions
const toggleOverlayUI = (toolbarItem, show) => {
  if (currentToolbarItem !== toolbarItem) {
    toggleOverlayUI(currentToolbarItem, false);
  }
  currentToolbarItem = toolbarItem;
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

const remoteSyncInit = async () => {
  const onlineVal = await isOnline();
  if (onlineVal) {
    codes = await tryConnection();
    if (codes) {
      document.querySelector('.sync-dialogue .controller-code-num').innerText = codes.sync;
      document.querySelector('.remote-dialogue .controller-code-num').innerText = codes.admin;
      document
        .querySelector('#tool-sync-button')
        .setAttribute('title', `sync:${codes.sync} | admin:${codes.admin}`);
    }
  } else {
    document.querySelector('.sync-dialogue .controller-code-num').innerText = ' ';
    document.querySelector('#tool-sync-button').setAttribute('title', ' ');
  }
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

const syncToggle = async (forceConnect = false) => {
  if (isConnected.sync && !forceConnect) {
    isConnected.sync = false;
    onEnd(codes.sync, 'sync');
    codes.sync = '...';
    onEnd(codes.admin, 'admin');
    codes.admin = '...';
    global.controller.sendText('');
    document.querySelector('.sync-dialogue .controller-code-num').innerText = '...';
    document.querySelector('.remote-dialogue .controller-code-num').innerText = '...';
    document.querySelector('#tool-sync-button').setAttribute('title', ' ');
    analytics.trackEvent('syncStopped', true);
  } else {
    isConnected.sync = true;
    await remoteSyncInit();
  }
  document.querySelector('.present-btn').innerText = isConnected.sync
    ? 'Stop Session'
    : 'Start Session';
};

const controllerFactory = (description, codeLabel, codeNum, buttons) => {
  return h('div.controller-content', [
    h('div.left-controller-content', [h('div.controller-code-desc', description)]),
    h('div.right-controller-content', [
      h('div.controller-code-label', codeLabel),
      h('div.controller-code-num', codeNum),
      h(
        'div.button-wrap',
        buttons.map(btn =>
          h(`button.button${btn.classes || ''}`, { onclick: btn.action || null }, btn.text || ''),
        ),
      ),
    ]),
  ]);
};

const syncContent = controllerFactory(
  `Enter this code on sttm.co/sync to follow along SikhiToTheMax on any web browser (including mobile). 
  Press the "Present" button to display the pairing code for the sangat.`,
  'Your unique sync code is',
  codes.sync,
  [
    {
      classes: '.present-btn',
      action: () => {
        syncToggle();
      },
      text: isConnected.sync ? 'Stop Session' : 'Start Session',
    },
    {
      classes: '.copy-code-btn',
      action: () => {
        if (codes.sync !== '...') {
          const syncString = `<p>Visit sttm.co/sync on your mobile 
            device and enter the code below to follow along</p> <h1>${codes.sync} </h1>`;
          global.controller.sendText(syncString);
        }
      },
      text: 'Present',
    },
  ],
);

const remoteContent = controllerFactory(
  ['This allows you to control sttm desktop from sttm site or a 3rd app etc etc.'],
  'Your admin pin code is',
  codes.admin,
  [
    {
      text: 'Allow Control',
    },
  ],
);

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
  return h(
    'div.bani-group-container',
    h(`header.bani-group-heading.${baniGroupClass}-heading`, baniGroupName),
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
              'English Explanations',
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
            h('div.ceremony-theme-header', 'Choose a Theme to launch'),
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

    document.querySelector('.sync-dialogue').appendChild(syncContent);

    document.querySelector('.remote-dialogue').appendChild(remoteContent);

    const syncButton = document.querySelector('#tool-sync-button');

    syncButton.addEventListener('click', () => {
      analytics.trackEvent('syncStarted', true);
      syncToggle(true);
    });

    const controllerDialogueWrapper = document.querySelector('.controller-dialogue-wrapper');
    controllerDialogueWrapper.addEventListener('click', event => {
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
