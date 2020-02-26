const electron = require('electron');

const { remote } = electron;
const main = remote.require('./app');

const analytics = remote.getGlobal('analytics');
const search = require('../search');
const strings = require('../strings');
const dhanGuruModal = require('../insert-slide');
const copy = require('../copy');

/* NOTE:
 * All these functions are mapped to keys in shortcuts-map.json
 */

/* *******************
 * HELPER FUNCTIONS
 ******************** */
const maintainScroll = $line => {
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
};

const highlightLine = (newLine, nextLineCount = null) => {
  const nextLineSelector = nextLineCount ? `#li_${nextLineCount} a.panktee` : `#line${newLine}`;
  const $line = search.$shabad.querySelector(nextLineSelector);
  $line.click();
  maintainScroll($line);
};

// is the current slide of the shabad (= false) or an inserted slide (= true)
let isInsertedSlide = false;
const updateInsertedSlide = newValue => {
  isInsertedSlide = newValue;
};

/* ******************
 * SLIDE SHORTCUTS
 ******************** */
const waheguru = () => {
  global.controller.sendText(strings.slideStrings.waheguru, true);
  isInsertedSlide = true;
};
const empty = () => {
  global.controller.sendText(' ');
  isInsertedSlide = true;
};
const moolMantra = () => {
  global.controller.sendText(strings.slideStrings.moolMantra, true);
  isInsertedSlide = true;
};

/* *******************
 * CEREMONY SHORTCUTS
 ******************** */
const anandSahibBhog = () => {
  global.core.search.loadCeremony(3).catch(error => {
    analytics.trackEvent('ceremonyFailed', 3, error);
  });
};

/* *******************
 * INTERFACE SHORTCUTS
 ******************** */
const help = () => main.openSecondaryWindow('helpWindow');
const legend = () => main.openSecondaryWindow('shortcutLegend');
const searchBar = () => {
  search.$search.focus();
  search.$search.value = '';
};

/* *******************
 * OTHER SHORTCUTS
 ******************** */
const openFirstResult = () => {
  if (document.activeElement.id === 'search') {
    document.querySelector('#results .search-result').click();
    document.getElementById('shabad-page').focus();
  }
};

const homePanktee = () => {
  const currentLineId = search.$shabad.querySelector('a.panktee.current').dataset.lineId;
  if (!isInsertedSlide) {
    const mainLineID = search.$shabad.querySelector('a.panktee.main').dataset.lineId;

    let newLineId = mainLineID;

    if (mainLineID === currentLineId) {
      newLineId = search.$shabad.querySelector('a.panktee:not(.seen_check)').dataset.lineId;
    }

    highlightLine(newLineId);
  } else {
    highlightLine(currentLineId);
    document.getElementById('shabad-page').focus();
    isInsertedSlide = false;
  }
};

const prevLine = () => {
  // Find selector of current line in Shabad
  const $currentLine = search.$shabad.querySelector('a.panktee.current').parentNode;
  const $prevLine = $currentLine.previousElementSibling;
  // if its not at the topmost panktee
  if ($prevLine && $prevLine.dataset.lineCount) {
    const $prevPanktee = $prevLine.querySelector('a.panktee');
    $prevPanktee.click();
    maintainScroll($prevPanktee);
  }
};

const nextLine = () => {
  // Find selector of current line in Shabad
  const $currentLine = search.$shabad.querySelector('a.panktee.current').parentNode;
  const $nextLine = $currentLine.nextElementSibling;
  // if its not at the last panktee
  if ($nextLine && $nextLine.dataset.lineCount) {
    const $nextPanktee = $nextLine.querySelector('a.panktee');
    $nextPanktee.click();
    maintainScroll($nextPanktee);
  }
};

const showDhanGuruModal = () => {
  dhanGuruModal.isAnnouncementTab = false;
  dhanGuruModal.openModal();
  dhanGuruModal.buttonOnClick();
};

const copyPanktee = () => {
  if (document.activeElement.id === 'shabad-page') {
    copy.copyPanktee();
  }
};

module.exports = {
  waheguru,
  empty,
  moolMantra,
  anandSahibBhog,
  help,
  legend,
  searchBar,
  prevLine,
  nextLine,
  maintainScroll,
  highlightLine,
  openFirstResult,
  updateInsertedSlide,
  homePanktee,
  showDhanGuruModal,
  copyPanktee,
};
