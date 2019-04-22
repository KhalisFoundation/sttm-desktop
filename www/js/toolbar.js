const h = require('hyperscript');
const { remote } = require('electron');
const anvaad = require('anvaad-js');
const banidb = require('./banidb');

const { store } = remote.require('./app');
const analytics = remote.getGlobal('analytics');

const toolbarItems = ['sunder-gutka', 'ceremonies'];
const navLinks = require('./search');

const nitnemBanis = [2, 4, 6, 9, 10, 20, 21, 23];
const popularBanis = [90, 30, 31, 22];

const $toolbar = document.querySelector('#toolbar');
const $baniList = document.querySelector('.bani-list');
const $ceremoniesList = document.querySelector('.ceremonies-list');
const $baniExtras = document.querySelector('.bani-extras');
let currentToolbarItem;

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

// factories
const navigatorHeaderFactory = (id, content, lang) =>
  h(`header.navigator-header#${id}`, h(`span.${lang}`, content));

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
      },
    },
    h('div.gurmukhi', row.Gurmukhi),
  );

const toolbarItemFactory = toolbarItem =>
  h(`div.toolbar-item#tool-${toolbarItem}`, {
    onclick: () => {
      toggleOverlayUI(toolbarItem, true);
    },
  });

const closeOverlayUI = h(
  'div.close-overlay-ui.overlay-ui.common-overlay.hidden',
  {
    onclick: () => {
      toggleOverlayUI(currentToolbarItem, false);
    },
  },
  h('i.fa.fa-times'),
);

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

const printCeremonies = rows => {
  rows.forEach(row => {
    if (row.Token !== 'anand' && row.Token !== 'death') {
      const $ceremony = h(
        `div.ceremony-pane#${row.Token}`,
        {
          onclick: () => {
            analytics.trackEvent('ceremony', row.Token);
            global.core.search.loadCeremony(row.ID);
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
                const englishExpVal = store.getUserPref(`gurbani.ceremonies.${row.Token}-english`);
                store.setUserPref(`gurbani.ceremonies.${row.Token}-english`, !englishExpVal);
                global.platform.updateSettings();
              },
              store.getUserPref(`gurbani.ceremonies.${row.Token}-english`),
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

module.exports = {
  init() {
    toolbarItems.forEach(toolbarItem => {
      $toolbar.appendChild(toolbarItemFactory(toolbarItem));
    });

    $baniList.querySelector('header').appendChild(translitSwitch);
    $baniExtras.appendChild(baniGroupFactory('nitnem banis'));
    $baniExtras.appendChild(baniGroupFactory('popular banis'));
    banidb.loadBanis().then(rows => printBanis(rows));
    banidb.loadCeremonies().then(rows => printCeremonies(rows));
    $toolbar.appendChild(closeOverlayUI);
  },
};
