/* eslint-disable arrow-parens */

// Gurmukhi keyboard layout file
const keyboardLayout = require('./keyboard.json');
const pageNavJSON = require('./footer-left.json');
// HTMLElement builder
const h = require('hyperscript');

const { store } = require('electron').remote.require('./app');

const CONSTS = require('./constants.js');

// the non-character keys that will register as a keypress when searching
const allowedKeys = [
  8, // Backspace
  32, // Spacebar
  46, // Delete
];
const sessionList = [];
const currentShabad = [];
const kbPages = [];
let currentMeta = {};
let newSearchTimeout;
let autoplaytimer;

// build the search bar and toggles and append to HTML
const searchInputs = h('div#search-container', [
  h('input#search.gurmukhi', {
    disabled: 'disabled',
    type: 'search',
    onfocus: e => module.exports.focusSearch(e),
    onkeyup: e => module.exports.typeSearch(e),
  }),
  h('div#search-bg'),
  h(
    'button#search-options-toggle',
    {
      type: 'button',
      onclick: e => module.exports.toggleSearchOptions(e),
    },
    h('i.fa.fa-cog'),
  ),
  h(
    'button#gurmukhi-keyboard-toggle',
    {
      type: 'button',
      onclick: e => module.exports.toggleGurmukhiKB(e),
    },
    h('i.fa.fa-keyboard-o'),
  ),
  h('div#db-download-progress'),
]);

// build the Gurmukhi keyboard and append to HTML
Object.keys(keyboardLayout).forEach(i => {
  const klPage = keyboardLayout[i];
  const page = [];

  Object.keys(klPage).forEach(j => {
    const klRow = klPage[j];
    const row = [];

    Object.keys(klRow).forEach(k => {
      const klRowSet = klRow[k];
      const rowSet = [];

      Object.keys(klRowSet).forEach(l => {
        const klButton = klRowSet[l];
        if (typeof klButton === 'object') {
          rowSet.push(
            h(
              'button',
              {
                type: 'button',
                onclick: e => module.exports.clickKBButton(e, klButton.action),
              },
              klButton.icon ? h(klButton.icon) : klButton.char,
            ),
          );
        } else {
          rowSet.push(
            h(
              'button',
              {
                type: 'button',
                onclick: e => module.exports.clickKBButton(e),
              },
              klButton,
            ),
          );
        }
      });
      row.push(h('div.keyboard-row-set', rowSet));
    });
    page.push(h('div.keyboard-row', row));
  });
  kbPages.push(
    h(
      `div#gurmukhi-keyboard-page-${parseInt(i, 10) + 1}.page${
        parseInt(i, 10) === 0 ? '.active' : ''
      }`,
      page,
    ),
  );
});
const keyboard = h('div#gurmukhi-keyboard.gurmukhi', kbPages);

const searchTypes = Object.values(CONSTS.SEARCH_TYPE_TEXTS);

const searchTypeOptions = searchTypes.map((string, value) =>
  h('option', { value }, string),
);

const shabadNavFwd = h(
  'div#shabad-next.navigator-button',
  {
    onclick: () => module.exports.loadAdjacentShabad(),
  },
  h('i.fa.fa-arrow-circle-o-right'),
);

const shabadNavBack = h(
  'div#shabad-prev.navigator-button',
  {
    onclick: () => module.exports.loadAdjacentShabad(false),
  },
  h('i.fa.fa-arrow-circle-o-left'),
);

const searchOptions = h(
  'div#search-options',
  h(
    'select#search-type',
    {
      onchange() {
        module.exports.changeSearchType(parseInt(this.value, 10));
      },
    },
    searchTypeOptions,
  ),
);

const navPageLinks = [];
Object.keys(pageNavJSON).forEach(id => {
  navPageLinks.push(
    h(
      'li',
      h(
        `a#${id}-pageLink`,
        {
          onclick: () => module.exports.navPage(id),
        },
        h(`i.fa.fa-${pageNavJSON[id].icon}`),
      ),
    ),
  );
});
const footerNav = h('ul.menu-bar', navPageLinks);

const sources = {
  G: 'Guru Granth Sahib',
  D: 'Dasam Granth Sahib',
  B: 'Vaaran',
  N: 'Gazals',
  A: 'Amrit Keertan',
  S: 'Vaaran',
};

// Close the KB if anywhere is clicked besides anything in .search-div
document.body.addEventListener('click', e => {
  const target = e.target;
  if (
    document.querySelector('.search-div') &&
    !document.querySelector('.search-div').contains(target)
  ) {
    module.exports.closeGurmukhiKB();
  }
});

function akhandPaatt() {
  module.exports.$shabad.innerHTML = '';
  global.controller.clearAPV();
}

module.exports = {
  currentShabad,
  currentMeta,

  init() {
    this.searchType = parseInt(store.get('searchOptions.searchType'), 10);
    searchOptions.querySelector('#search-type').value = this.searchType;

    document.querySelector('.search-div').appendChild(searchInputs);
    document.querySelector('.search-div').appendChild(keyboard);
    document.querySelector('.search-div').appendChild(searchOptions);
    document.querySelector('.shabad-next').appendChild(shabadNavFwd);
    document.querySelector('.shabad-prev').appendChild(shabadNavBack);
    document.querySelector('#footer .menu-group-left').appendChild(footerNav);
    this.$navigator = document.getElementById('navigator');
    this.$searchPage = document.getElementById('search-page');
    this.$search = document.getElementById('search');
    this.$searchType = document.getElementById('search-type');
    this.$dbDownloadProgress = document.getElementById('db-download-progress');
    this.$results = document.getElementById('results');
    this.$session = document.getElementById('session');
    this.$sessionContainer = document.querySelector(
      '#session-page .block-list',
    );
    this.$shabad = document.getElementById('shabad');
    this.$shabadContainer = document.querySelector('#shabad-page .block-list');
    this.$gurmukhiKB = document.getElementById('gurmukhi-keyboard');
    this.$kbPages = this.$gurmukhiKB.querySelectorAll('.page');
    this.$navPages = document.querySelectorAll('.nav-page');
    this.$navPageLinks = document.querySelectorAll(
      '#footer .menu-group-left a',
    );

    this.navPage('search');
  },

  offline(seconds) {
    this.$search.placeholder = `Offline. Retrying database download in ${seconds}s`;
    const newSeconds = seconds - 1;
    if (newSeconds > -1) {
      setTimeout(() => this.offline(newSeconds), 1000);
    } else {
      global.platform.downloadLatestDB(true);
    }
  },

  initSearch() {
    this.$dbDownloadProgress.style.height = 0;
    this.$search.disabled = false;
    this.$search.focus();
    this.changeSearchType(this.searchType);
  },

  updateDLProgress(state) {
    this.$dbDownloadProgress.style.height = '2px';
    this.$dbDownloadProgress.style.width = `${state.percent * 100}%`;
  },

  // eslint-disable-next-line no-unused-vars
  focusSearch(e) {
    // open the Gurmukhi keyboard if it was previously open
    if (store.get('gurmukhiKB')) {
      this.openGurmukhiKB();
    }
  },

  typeSearch(e) {
    // if a key is pressed in the Gurmukhi KB or is one of the allowed keys
    if (
      e === 'gKB' ||
      (e.which <= 90 && e.which >= 48) ||
      allowedKeys.indexOf(e.which) > -1
    ) {
      // don't search if there is less than a 100ms gap in between key presses
      clearTimeout(newSearchTimeout);
      newSearchTimeout = setTimeout(() => this.search(), 100);
    }
  },

  // eslint-disable-next-line
  toggleSearchOptions(e) {
    this.$searchPage.classList.toggle('search-options-open');
  },

  changeSearchType(value) {
    this.searchType = value;
    this.search();
    store.set('searchOptions.searchType', this.searchType);
    if (value >= 3) {
      this.$search.classList.add('roman');
      this.$search.classList.remove('gurmukhi');
    } else {
      this.$search.classList.remove('roman');
      this.$search.classList.add('gurmukhi');
    }
    document.body.classList.remove(
      'searchResults_translationEnglish',
      'searchResults_transliteration',
    );
    switch (value) {
      case 3:
        document.body.classList.add('searchResults_translationEnglish');
        break;
      default:
        break;
    }
    this.$search.placeholder = this.$searchType.options[
      this.$searchType.selectedIndex
    ].label;
    this.$search.focus();
  },

  // eslint-disable-next-line no-unused-vars
  toggleGurmukhiKB(e) {
    const gurmukhiKBPref = store.get('gurmukhiKB');
    // no need to set a preference if user is just re-opening after KB was auto-closed
    if (!this.$navigator.classList.contains('kb-active') && gurmukhiKBPref) {
      this.openGurmukhiKB();
    } else {
      store.set('gurmukhiKB', !gurmukhiKBPref);
      // Focus search
      // This will also auto-show they KB if that's what the new pref is
      this.$search.focus();
      // Toggle KB if it was supposed to be turned off
      if (gurmukhiKBPref) {
        this.$navigator.classList.toggle('kb-active');
      }
    }
  },

  openGurmukhiKB() {
    this.$navigator.classList.add('kb-active');
  },

  closeGurmukhiKB() {
    this.$navigator.classList.remove('kb-active');
  },

  clickKBButton(e, action = false) {
    const button = e.currentTarget;
    if (action) {
      if (action === 'bksp') {
        this.$search.value = this.$search.value.substring(
          0,
          this.$search.value.length - 1,
        );
        this.typeSearch('gKB');
      } else if (action === 'close') {
        this.toggleGurmukhiKB();
      } else if (action.includes('page')) {
        Array.from(this.$kbPages).forEach(el => {
          el.classList.remove('active');
        });
        document
          .getElementById(`gurmukhi-keyboard-${action}`)
          .classList.add('active');
      }
    } else {
      // some buttons may have a different value than what is displayed on the key,
      // in which case use the data-value attribute
      const char = button.dataset.value || button.innerText;
      this.$search.value += char;
      // simulate a physical keyboard button press
      this.typeSearch('gKB');
    }
  },

  // eslint-disable-next-line no-unused-vars
  search(e) {
    const searchQuery = this.$search.value;
    if (searchQuery.length >= 1) {
      global.platform.search.search(searchQuery, this.searchType);
    } else {
      this.$results.innerHTML = '';
    }
  },

  akhandPaatt,

  printResults(rows) {
    if (rows.length > 0) {
      this.$results.innerHTML = '';
      rows.forEach(item => {
        const resultNode = [];
        resultNode.push(h('span.gurmukhi', item.Gurmukhi));
        resultNode.push(h('span.transliteration.roman', item.Transliteration));
        resultNode.push(h('span.translation.english.roman', item.English));
        resultNode.push(
          h(
            'span.meta.roman',
            `${sources[item.SourceID]} - ${item.PageNo} - ${
              item.RaagEnglish
            } - ${item.WriterEnglish}`,
          ),
        );
        const result = h(
          'li',
          {},
          h(
            'a.panktee.search-result',
            {
              onclick: ev => this.clickResult(ev, item.ShabadID, item.ID,
                                                  item),
            },
            resultNode,
          ),
        );
        this.$results.appendChild(result);
      });
    } else {
      this.$results.innerHTML = '';
      this.$results.appendChild(h('li.roman', h('span', 'No results')));
    }
  },

  clickResult(e, ShabadID, LineID, Line) {
    document.body.classList.remove('home');
    this.closeGurmukhiKB();
    const sessionItem = h(
      `li#session-${ShabadID}`,
      {},
      h(
        'a.panktee.current',
        {
          onclick: ev => this.clickSession(ev, ShabadID, LineID),
        },
        Line.Gurmukhi));
    // get all the lines in the session block and remove the .current class from them
    const sessionLines = this.$session.querySelectorAll('a.panktee');
    Array.from(sessionLines).forEach(el => el.classList.remove('current'));
    // if the ShabadID of the clicked Panktee isn't in the sessionList variable,
    // add it to the variable
    if (sessionList.indexOf(ShabadID) < 0) {
      sessionList.push(ShabadID);
    } else {
      // if the ShabadID is already in the session, just remove the HTMLElement,
      // and leave the sessionList
      const line = this.$session.querySelector(`#session-${ShabadID}`);
      this.$session.removeChild(line);
    }
    // add the line to the top of the session block
    this.$session.insertBefore(sessionItem, this.$session.firstChild);
    // send the line to app.js, which will send it to the viewer window
    global.controller.sendLine(ShabadID, LineID, Line);
    // are we in APV
    const apv = document.body.classList.contains('akhandpaatt');
    // load the Shabad into the controller
    this.loadShabad(ShabadID, LineID, apv);
    // scroll the session block to the top to see the highlighted line
    this.$sessionContainer.scrollTop = 0;
    this.navPage('shabad');
  },

  loadShabad(ShabadID, LineID, apv = false) {
    /*
    if (window.socket !== undefined) {
      window.socket.emit('data', { shabadid: ShabadID, highlight: LineID });
    }
    */
    // clear the Shabad controller and empty out the currentShabad array
    const $shabadList = this.$shabad || document.getElementById('shabad');
    $shabadList.innerHTML = '';
    currentShabad.splice(0, currentShabad.length);
    if (apv) {
      global.platform.search
        .getAng(ShabadID)
        .then(ang => {
          currentMeta = ang;
          return global.platform.search.loadAng(ang.PageNo, ang.SourceID);
        })
        .then(rows => this.printShabad(rows, ShabadID, LineID));
    } else {
      global.platform.search.loadShabad(ShabadID, LineID);
    }
  },

  loadAng(PageNo, SourceID) {
    global.platform.search
      .loadAng(PageNo, SourceID)
      .then(rows => this.printShabad(rows));
  },

  loadAdjacentShabad(Forward = true) {
    const FirstLine = currentShabad[0];
    const LastLine = currentShabad[currentShabad.length - 1];
    this.$shabad.innerHTML = '';
    currentShabad.splice(0, currentShabad.length);
    // Load the same shabad if on first or last shabad
    const PreviousVerseID = FirstLine === 1 ? FirstLine : FirstLine - 1;
    const NextVerseID = LastLine === 60403 ? LastLine : LastLine + 1;
    global.platform.search.loadAdjacentShabad(
      PreviousVerseID,
      NextVerseID,
      Forward,
    );
  },

  printShabad(rows, ShabadID, LineID) {
    const lineID = LineID || rows[0].ID;
    let mainLine;
    rows.forEach((item) => {
      if (parseInt(lineID, 10) === item.ID) {
        mainLine = item;
      }
      const shabadLine = h(
        'li',
        {},
        h(
          `a#line${item.ID}.panktee${
            parseInt(lineID, 10) === item.ID ? '.current.main.seen_check' : ''
          }`,
          {
            'data-line-id': item.ID,
            onclick: e => this.clickShabad(e, item.ShabadID || ShabadID,
                           item.ID, item),
          },
          [
            h('i.fa.fa-fw.fa-check'),
            h('i.fa.fa-fw.fa-home'),
            ' ',
            item.Gurmukhi,
          ],
        ),
      );
      // write the Panktee to the controller
      this.$shabad.appendChild(shabadLine);
      // append the currentShabad array
      currentShabad.push(item.ID);
      if (lineID === item.ID) {
        this.currentLine = item.ID;
      }
    });
    // scroll the Shabad controller to the current Panktee
    const curPankteeTop = this.$shabad.querySelector('.current').parentNode
      .offsetTop;
    this.$shabadContainer.scrollTop = curPankteeTop;
    // send the line to app.js, which will send it to the viewer window as well as obs file
    global.controller.sendLine(ShabadID, lineID, mainLine);
    // Hide next and previous links before loading first and last shabad
    const $shabadNext = document.querySelector('#shabad-next');
    const $shabadPrev = document.querySelector('#shabad-prev');
    if (currentShabad[0] === 1) {
      $shabadPrev.classList.add('hide');
      $shabadNext.classList.remove('hide');
    } else if (currentShabad[currentShabad.length - 1] === 60403) {
      $shabadNext.classList.add('hide');
      $shabadPrev.classList.remove('hide');
    } else {
      $shabadPrev.classList.remove('hide');
      $shabadNext.classList.remove('hide');
    }
    this.checkAutoPlay(lineID);
  },

  clearSession() {
    while (this.$session.firstChild) {
      this.$session.removeChild(this.$session.firstChild);
      sessionList.splice(0, sessionList.length);
    }
  },

  clickSession(e, ShabadID, LineID) {
    const $panktee = e.target;
    this.loadShabad(ShabadID, LineID);
    const sessionLines = this.$session.querySelectorAll('a.panktee');
    Array.from(sessionLines).forEach(el => el.classList.remove('current'));
    $panktee.classList.add('current');
    this.navPage('shabad');
  },

  checkAutoPlay(LineID = null) {
    clearTimeout(autoplaytimer);
    if (!LineID) {
      document.body.querySelector('#shabad .panktee.current').click();
    }
    const bodyClassList = document.body.classList;
    const delay = [...bodyClassList]
      .find(value => /^autoplayTimer-/.test(value))
      .replace('autoplayTimer-', '');
    if (
      bodyClassList.contains('autoplay') &&
      LineID !== currentShabad[currentShabad.length - 1]
    ) {
      autoplaytimer = setTimeout(() => {
        document.getElementById(`line${LineID + 1}`).click();
      }, delay * 1000);
    }
  },

  clickShabad(e, ShabadID, LineID, Line) {
    /*
    if (window.socket !== undefined) {
      window.socket.emit('data', { shabadid: ShabadID, highlight: LineID });
    }
    */
    const lines = this.$shabad.querySelectorAll('a.panktee');
    if (e.target.classList.contains('fa-home')) {
      // Change main line
      const $panktee = e.target.parentNode;
      Array.from(lines).forEach(el => el.classList.remove('main'));
      $panktee.classList.add('main', 'seen_check');
    } else if (e.target.classList.contains('panktee')) {
      // Change line to click target
      const $panktee = e.target;
      this.currentLine = LineID;
      global.controller.sendLine(ShabadID, LineID, Line);
      // Remove 'current' class from all Panktees
      Array.from(lines).forEach(el => el.classList.remove('current'));
      // Add 'current' and 'seen-check' to selected Panktee
      $panktee.classList.add('current', 'seen_check');
    }
    this.checkAutoPlay(LineID);
  },

  navPage(page) {
    this.$navPages.forEach($navPage => {
      $navPage.classList.remove('active');
    });
    this.$navPageLinks.forEach($navPageLink => {
      $navPageLink.classList.remove('active');
    });
    document.querySelector(`#${page}-page`).classList.add('active');
    document.querySelector(`#${page}-pageLink`).classList.add('active');
  },
};
