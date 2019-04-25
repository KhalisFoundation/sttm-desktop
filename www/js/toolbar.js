const h = require('hyperscript');
const { remote } = require('electron');
const anvaad = require('anvaad-js');
const banidb = require('./banidb');

const analytics = remote.getGlobal('analytics');

const navLinks = require('./search');

const toolbarItems = ['sunder-gutka'];
const nitnemBanis = [2, 4, 6, 9, 10, 20, 21, 23];
const popularBanis = [90, 30, 31, 22];
let banisLoaded = false;

const $toolbar = document.querySelector('#toolbar');
const $baniList = document.querySelector('.bani-list');
const $baniExtras = document.querySelector('.bani-extras');

const blockList = (lang, id) => h('section.blocklist', h(`ul#${id}.lang`));

const toggleOverlayUI = () => {
  document.querySelectorAll('.base-ui').forEach(uiElement => {
    uiElement.classList.toggle('blur');
  });
  document.querySelectorAll('.overlay-ui').forEach(uiElement => {
    uiElement.classList.toggle('hidden');
  });
};

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
        toggleOverlayUI();
        analytics.trackEvent('sunderGutkaBanis', tileType, row.Token);
        navLinks.navPage('shabad');
      },
    },
    h('div.gurmukhi', row.Gurmukhi),
  );

const printBanis = rows => {
  const banisListID = 'sunder-gutka-banis';
  $baniList.appendChild(blockList('gurmukhi', banisListID));
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
          toggleOverlayUI();
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
        toggleOverlayUI();
        if (!banisLoaded) {
          banidb.loadBanis().then(rows => {
            printBanis(rows);
            banisLoaded = !!rows;
          });
          analytics.trackEvent('banisLoaded', true);
        }
      }
    },
  });

const closeOverlayUI = h(
  'div.close-overlay-ui.overlay-ui.hidden',
  {
    onclick: toggleOverlayUI,
  },
  h('i.fa.fa-times'),
);

module.exports = {
  init() {
    toolbarItems.forEach(toolbarItem => {
      $toolbar.appendChild(toolbarItemFactory(toolbarItem));
      $toolbar.appendChild(closeOverlayUI);
      $baniList.querySelector('header').appendChild(translitSwitch);
      $baniExtras.appendChild(baniGroupFactory('nitnem banis'));
      $baniExtras.appendChild(baniGroupFactory('popular banis'));
    });
  },
};
