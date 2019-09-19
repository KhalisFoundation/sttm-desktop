/* global Mousetrap */
const electron = require('electron');

const { remote } = electron;
const main = remote.require('./app');

const search = require('./search');
const strings = require('./strings');
const dhanGuruModal = require('./insert-slide');
const menu = require('./menu');
const themeEditor = require('./theme_editor');
const shareSync = require('./share-sync');
const settings = require('../js/settings');
const shortcutTray = require('./shortcut_tray');
const toolbar = require('./toolbar');

const analytics = remote.getGlobal('analytics');
/* const Settings = require('../../js/settings');
const settings = new Settings(platform.store); */

// is the current slide of the shabad (= false) or an inserted slide (= true)
let isInsertedSlide = false;
const updateInsertedSlide = newValue => {
  isInsertedSlide = newValue;
};

function escKey() {
  /* if (settings.$settings.classList.contains('animated')) {
    settings.closeSettings();
  } */
}

const slideShortcuts = {
  waheguru: () => {
    global.controller.sendText(strings.slideStrings.waheguru, true);
    isInsertedSlide = true;
  },
  empty: () => {
    global.controller.sendText(' ');
    isInsertedSlide = true;
  },
  moolMantra: () => {
    global.controller.sendText(strings.slideStrings.moolMantra, true);
    isInsertedSlide = true;
  },
};
const ceremonyShortcuts = {
  anandSahibBhog: () =>
    global.core.search.loadCeremony(3).catch(error => {
      analytics.trackEvent('ceremonyFailed', 3, error);
    }),
};
const interfaceShortcuts = {
  help: () => main.openSecondaryWindow('helpWindow'),
  legend: () => main.openSecondaryWindow('shortcutLegend'),
  searchBar: () => {
    search.$search.focus();
    search.$search.value = '';
  },
};
function maintainScroll($line) {
  const curPankteeTop = $line.parentNode.offsetTop;
  const curPankteeHeight = $line.parentNode.offsetHeight;
  const containerTop = search.$shabadContainer.scrollTop;
  const containerHeight = search.$shabadContainer.offsetHeight;

  if (containerTop > curPankteeTop) {
    search.$shabadContainer.scrollTop = curPankteeTop;
  }
  if (containerTop + containerHeight < curPankteeTop + curPankteeHeight) {
    search.$shabadContainer.scrollTop = curPankteeTop - containerHeight + curPankteeHeight;
  }
}

function highlightLine(newLine, nextLineCount = null) {
  const nextLineSelector = nextLineCount ? `#li_${nextLineCount} a.panktee` : `#line${newLine}`;
  const $line = search.$shabad.querySelector(nextLineSelector);
  $line.click();
  maintainScroll($line);
}

function spaceBar(e) {
  const currentLineId = search.$shabad.querySelector('a.panktee.current').dataset.lineId;
  if (!isInsertedSlide) {
    const mainLineID = search.$shabad.querySelector('a.panktee.main').dataset.lineId;

    let newLineId = mainLineID;

    if (mainLineID === currentLineId) {
      newLineId = search.$shabad.querySelector('a.panktee:not(.seen_check)').dataset.lineId;
    }

    highlightLine(newLineId);
    e.preventDefault();
  } else {
    highlightLine(currentLineId);
    document.getElementById('shabad-page').focus();
    isInsertedSlide = false;
  }
}

function prevLine(e) {
  // Find selector of current line in Shabad
  const $currentLine = search.$shabad.querySelector('a.panktee.current').parentNode;
  const $prevLine = $currentLine.previousElementSibling;
  // if its not at the topmost panktee
  if ($prevLine && $prevLine.dataset.lineCount) {
    const $prevPanktee = $prevLine.querySelector('a.panktee');
    $prevPanktee.click();
    maintainScroll($prevPanktee);
  }
  e.preventDefault();
}

function nextLine(e) {
  // Find selector of current line in Shabad
  const $currentLine = search.$shabad.querySelector('a.panktee.current').parentNode;
  const $nextLine = $currentLine.nextElementSibling;
  // if its not at the last panktee
  if ($nextLine && $nextLine.dataset.lineCount) {
    const $nextPanktee = $nextLine.querySelector('a.panktee');
    $nextPanktee.click();
    maintainScroll($nextPanktee);
  }
  e.preventDefault();
}

function findLine(e) {
  e.preventDefault();
  const filterKey = e.key;

  // Find position of current line in shabad
  const pos = search.currentShabad.indexOf(search.currentLine);

  // Rotate the array based on current shabad
  const panktees = [...search.$shabad.getElementsByClassName('panktee')];
  const pankteesBeforePos = panktees.splice(0, pos + 1);
  const pankteesRotated = [...panktees, ...pankteesBeforePos];

  const lineFound = pankteesRotated.find(panktee => {
    const pankteeText = panktee.getAttribute('data-main-letters');
    return pankteeText.substring(0, 1) === filterKey;
  });

  if (lineFound) {
    lineFound.click();
  }
}
function openFirstResult() {
  document.querySelector('#results .search-result').click();
  document.getElementById('shabad-page').focus();
}

// Keyboard shortcuts
if (typeof Mousetrap !== 'undefined') {
  Mousetrap.bindGlobal('esc', escKey);

  Mousetrap.bindGlobal(['mod+1'], slideShortcuts.waheguru);
  Mousetrap.bindGlobal(['mod+2'], slideShortcuts.moolMantra);
  Mousetrap.bindGlobal(['mod+3'], slideShortcuts.empty);

  Mousetrap.bindGlobal(['mod+4'], ceremonyShortcuts.anandSahibBhog);

  Mousetrap.bindGlobal('mod+5', interfaceShortcuts.help);
  Mousetrap.bindGlobal('mod+6', interfaceShortcuts.legend);
  Mousetrap.bindGlobal('mod+/', interfaceShortcuts.searchBar);
  Mousetrap.bindGlobal('mod+g', () => {
    dhanGuruModal.isAnnouncementTab = false;
    dhanGuruModal.openModal();
    dhanGuruModal.buttonOnClick();
  });
  Mousetrap.bind(['up', 'left'], prevLine);
  Mousetrap.bind(['down', 'right'], nextLine);
  Mousetrap.bind('space', spaceBar);
  Mousetrap.bindGlobal('enter', () => {
    if (document.activeElement.id === 'search') {
      openFirstResult();
    }
  });
}

const $shabadPage = document.getElementById('shabad-page');
if ($shabadPage) {
  $shabadPage.addEventListener('keypress', findLine);
}

/**
 * Check if the platform has a method and call if it is does
 *
 * @since 3.2.2
 * @param {string} method Name of the platform method
 * @param {any} args Arguments to be passed to the method
 * @example
 *
 * global.core.platformMethod('updateSettings');
 */
function platformMethod(method, args) {
  if (typeof global.platform[method] === 'function') {
    global.platform[method](args);
  }
}

global.platform.ipc.on('sync-settings', () => {
  settings.init();
});
module.exports = {
  menu,
  search,
  shareSync,
  platformMethod,
  toolbar,
  themeEditor,
  updateInsertedSlide,
  shortcutTray,
  'custom-theme': () => {
    themeEditor.init();
  },
  akhandpaatt: search.akhandPaatt,
};
