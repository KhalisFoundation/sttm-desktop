/* global Mousetrap */
const search = require('./search');
const menu = require('./menu');
const themeEditor = require('./theme_editor');
const shareSync = require('./share-sync');
const settings = require('../js/settings');
const shortcutTray = require('./shortcut_tray');
const toolbar = require('./toolbar');

/* const Settings = require('../../js/settings');
const settings = new Settings(platform.store); */

function escKey() {
  /* if (settings.$settings.classList.contains('animated')) {
    settings.closeSettings();
  } */
}

function hideSlide() {
  // show Empty Slide
  global.controller.sendText('');
}
function waheguruSlide() {
  global.controller.sendText('vwihgurU', true);
}
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
  const mainLineID = search.$shabad.querySelector('a.panktee.main').dataset.lineId;
  const currentLineId = search.$shabad.querySelector('a.panktee.current').dataset.lineId;

  let newLineId = mainLineID;

  if (mainLineID === currentLineId) {
    newLineId = search.$shabad.querySelector('a.panktee:not(.seen_check)').dataset.lineId;
  }

  highlightLine(newLineId);
  e.preventDefault();
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

// Keyboard shortcuts
if (typeof Mousetrap !== 'undefined') {
  Mousetrap.bindGlobal('esc', escKey);
  Mousetrap.bindGlobal(['command+e', 'ctrl+e'], hideSlide);
  Mousetrap.bindGlobal(['command+1', 'ctrl+1'], waheguruSlide);
  Mousetrap.bind(['up', 'left'], prevLine);
  Mousetrap.bind(['down', 'right'], nextLine);
  Mousetrap.bind('/', () => search.$search.focus(), 'keyup');
  Mousetrap.bind('space', spaceBar);
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
  shortcutTray,
  'custom-theme': () => {
    themeEditor.init();
  },
  akhandpaatt: search.akhandPaatt,
};
