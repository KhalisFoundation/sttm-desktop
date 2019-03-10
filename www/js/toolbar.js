const h = require('hyperscript');
const banidb = require('./banidb');

const toolbarItems = ['sunder-gutka'];

const $toolbar = document.querySelector('#toolbar');

const printBanis = (rows) => {
  $toolbar.appendChild(h('div.bani-list'));
  document.querySelector('.bani-list').appendChild(JSON.stringify(rows));
};

const toolbarItemFactory = toolbarItem => h(
  `div.toolbar-item#tool-${toolbarItem}`,
  {
    onclick: (evt) => {
      evt.target.classList.toggle('active');
      document.querySelector('.focus-overlay').classList.toggle('hidden');
      banidb.loadBanis().then(rows => printBanis(rows));
    },
  },
);

module.exports = {
  init() {
    toolbarItems.forEach((toolbarItem) => {
      $toolbar.appendChild(toolbarItemFactory(toolbarItem));
    });
  },
};
