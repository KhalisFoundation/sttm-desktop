const h = require('hyperscript');
const banidb = require('./banidb');

const toolbarItems = ['sunder-gutka'];
const nitnemBanis = [2, 4, 6, 9, 10, 20, 22];
const popularBanis = [90, 22, 30, 31];

const $toolbar = document.querySelector('#toolbar');
const $baniList = document.querySelector('.bani-list');
const $baniExtras = document.querySelector('.bani-extras');

const blockList = (lang, id) => h(
  'section.blocklist',
  h(`ul#${id}.lang`),
);

const toggleOverlayUI = () => {
  document.querySelectorAll('.base-ui').forEach((uiElement) => {
    uiElement.classList.toggle('blur');
  });
  document.querySelectorAll('.overlay-ui').forEach((uiElement) => {
    uiElement.classList.toggle('hidden');
  });
};

const baniGroupFactory = (baniGroupName) => {
  const baniGroupClass = baniGroupName.replace(/ /g, '-');
  return h(
    'div.bani-group-container',
    h(`header.bani-group-heading.${baniGroupClass}-heading`, baniGroupName),
    h(`div.bani-group.${baniGroupClass}`),
  );
};

const extrasTile = (tileType, row) => h(
  `div.extras-tile.${tileType}`,
  {
    onclick: () => {
      global.core.search.loadBani(row.ID);
      toggleOverlayUI();
    },
  },
  h('div.gurmukhi', row.Gurmukhi),
);

const printBanis = (rows) => {
  const banisListID = 'sunder-gutka-banis';
  $baniList.appendChild(blockList('gurmukhi', banisListID));
  const $sunderGutkaBanis = document.querySelector(`#${banisListID}`);
  const $nitnemBanis = document.querySelector('.nitnem-banis');
  const $popularBanis = document.querySelector('.popular-banis');

  rows.forEach((row) => {
    let baniTag = 'none';
    if (nitnemBanis.includes(row.ID)) {
      baniTag = 'nitnem';
      $nitnemBanis.appendChild(extrasTile('nitnem-bani', row));
    }
    if (popularBanis.includes(row.ID)) {
      baniTag = 'popular';
      $popularBanis.appendChild(extrasTile('popular-bani', row));
    }
    const $bani = h(
      'li.sunder-gutka-bani.gurmukhi',
      {
        onclick: () => {
          global.core.search.loadBani(row.ID);
          toggleOverlayUI();
        },
      },
      h(`span.tag.tag-${baniTag}`),
      `${row.Gurmukhi}(${row.ID})`,
    );
    $sunderGutkaBanis.appendChild($bani);
  });
};

const toolbarItemFactory = toolbarItem => h(
  `div.toolbar-item#tool-${toolbarItem}`,
  {
    onclick: () => {
      toggleOverlayUI();
    },
  },
);


module.exports = {
  init() {
    toolbarItems.forEach((toolbarItem) => {
      $toolbar.appendChild(toolbarItemFactory(toolbarItem));
      $baniExtras.appendChild(baniGroupFactory('nitnem banis'));
      $baniExtras.appendChild(baniGroupFactory('popular banis'));
      banidb.loadBanis().then(rows => printBanis(rows));
    });
  },
};
