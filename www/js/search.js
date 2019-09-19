// HTMLElement builder
const h = require('hyperscript');
const { remote } = require('electron');

const banidb = require('./banidb');

const { CONSTS } = banidb;

// Gurmukhi keyboard layout file
const keyboardLayout = require('./keyboard.json');
const pageNavJSON = require('./footer-left.json');

const { store } = remote.require('./app');

const analytics = remote.getGlobal('analytics');

// the non-character keys that will register as a keypress when searching
const allowedKeys = [
  8, // Backspace
  32, // Spacebar
  46, // Delete
];
const sessionList = [];
const sessionStatesList = {};
const currentShabad = [];
const kbPages = [];
let currentMeta = {};
let newSearchTimeout;
let autoplaytimer;
// Temp
const infiniteScroll = false;

// build the search bar and toggles and append to HTML
const searchInputs = h('div#search-container', [
  h('input#search.gurmukhi', {
    disabled: 'disabled',
    type: 'search',
    onfocus: e => module.exports.focusSearch(e),
    onkeyup: e => module.exports.typeSearch(e),
    onpaste: e => module.exports.search(e, true),
  }),
  h('span', 'Ang'),
  h('input#ang-input.gurmukhi', {
    type: 'number',
    disabled: 'disabled',
    placeholder: '123',
    min: 1,
    max: 1430,
    onfocus: e => module.exports.focusSearch(e),
    oninput: e => module.exports.searchByAng(e),
  }),
  h(
    'button#gurmukhi-keyboard-toggle',
    {
      type: 'button',
      onclick: e => module.exports.toggleGurmukhiKB(e),
    },
    h('i.fa.fa-keyboard-o'),
  ),
  h('div#search-bg', [h('div#db-download-progress')]),
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

const gurmukhiSearchText = CONSTS.GURMUKHI_SEARCH_TEXTS;
const gurmukhiSearchTypes = Object.keys(gurmukhiSearchText);
const englishSearchText = CONSTS.ENGLISH_SEARCH_TEXTS;
const englishSearchTypes = Object.keys(englishSearchText);

const sourceTexts = CONSTS.SOURCE_TEXTS;
const sourceKeys = Object.keys(sourceTexts);

const gurmukhiSearchOptions = gurmukhiSearchTypes.map(value =>
  h('option', { value }, gurmukhiSearchText[value]),
);

const englishSearchOptions = englishSearchTypes.map(value =>
  h('option', { value }, englishSearchText[value]),
);

const gurmukhiInputs = h(
  'select',
  {
    onchange() {
      module.exports.changeSearchType(parseInt(this.value, 10));
    },
  },
  gurmukhiSearchOptions,
);

const englishInputs = h(
  'select',
  {
    onchange() {
      module.exports.changeSearchType(parseInt(this.value, 10));
    },
  },
  englishSearchOptions,
);

const searchLanguage = h(
  'div#language-selector',
  h('input', {
    type: 'radio',
    value: 'gr',
    id: 'gurmukhi-language',
    name: 'search-language',
    onclick() {
      module.exports.changeSearchLanguage(this.value);
    },
  }),
  h(
    'label',
    {
      htmlFor: 'gurmukhi-language',
      className: 'gurmukhi',
    },
    'aAe',
  ),
  h('input', {
    type: 'radio',
    value: 'en',
    id: 'english-language',
    name: 'search-language',
    onclick() {
      module.exports.changeSearchLanguage(this.value);
    },
  }),
  h('label', { htmlFor: 'english-language' }, 'ABC'),
);

const sourceOptions = sourceKeys.map(key => h('option', { value: key }, sourceTexts[key]));

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
  h('span.filter-text'),
  h(
    'select#search-source',
    {
      onchange() {
        module.exports.changeSearchSource(this.value);
        document.getElementById('source-selection').innerText = CONSTS.SOURCE_TEXTS[this.value];
      },
    },
    sourceOptions,
  ),
  h(
    'label.filter-text#source-selection',
    { htmlFor: 'search-source' },
    CONSTS.SOURCE_TEXTS[store.get('searchOptions.searchSource')],
  ),
);

const navPageLinks = [];
Object.keys(pageNavJSON).forEach(id => {
  const navType = pageNavJSON[id].type;
  navPageLinks.push(
    h(
      'li',
      h(
        `a#${id}-pageLink.${navType}`,
        {
          onclick: () => {
            if (navType === 'pane-nav') {
              // if it's one of the 4 panes (not a tab) then shift whole page
              module.exports.navPage(id);
            } else {
              // if it's a tab, open that tab in session page (bottom right pane)
              module.exports.activateNavPage('session', { id, label: pageNavJSON[id].label });
              module.exports.activateNavLink(id, true);
            }
          },
          'data-title': id,
        },
        h(`i.fa.fa-${pageNavJSON[id].icon}`),
      ),
    ),
  );
});

document.querySelectorAll('.nav-header-tab').forEach(element => {
  element.addEventListener('click', event => {
    const clickedTabId = event.currentTarget.dataset.title;
    module.exports.activateNavPage('session', {
      id: clickedTabId,
      label: pageNavJSON[clickedTabId].label,
    });
    module.exports.activateNavLink(clickedTabId, true);
  });
});

const presenterSwitch = h('li', [
  h('span', 'Presenter View'),
  h('div.switch', [
    h('input#presenter-view-toggle', {
      name: 'presenter-view-toggle',
      type: 'checkbox',
      checked: store.getUserPref('app.layout.presenter-view'),
      onclick: () => {
        store.setUserPref(
          'app.layout.presenter-view',
          !store.getUserPref('app.layout.presenter-view'),
        );
        global.platform.updateSettings();
        global.controller['presenter-view']();
      },
      value: 'presenter-view',
    }),
    h('label', {
      htmlFor: 'presenter-view-toggle',
    }),
  ]),
]);

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
  const { target } = e;
  if (
    document.querySelector('.search-div') &&
    !document.querySelector('.search-div').contains(target) &&
    !document.querySelector('#search-page .navigator-header').contains(target)
  ) {
    module.exports.closeGurmukhiKB();
  }
});

function akhandPaatt() {
  // FIXME
  // module.exports.$shabad.innerHTML = '';
  // global.controller.clearAPV();
}

module.exports = {
  currentShabad,
  currentMeta,

  init() {
    this.searchSource = store.get('searchOptions.searchSource');
    searchOptions.querySelector('#search-source').value = this.searchSource;

    document.querySelector('.search-div').appendChild(searchInputs);
    document.querySelector('.search-div').appendChild(keyboard);
    document.querySelector('.search-div').appendChild(searchOptions);
    document.querySelector('#search-page .navigator-header').appendChild(searchLanguage);
    document.querySelector('.shabad-next').appendChild(shabadNavFwd);
    document.querySelector('.shabad-prev').appendChild(shabadNavBack);
    document.querySelector('#footer .menu-group-left').appendChild(footerNav);
    document.querySelector('.presenter-switch').appendChild(presenterSwitch);

    this.$navigator = document.getElementById('navigator');
    this.$searchPage = document.getElementById('search-page');
    this.$search = document.getElementById('search');
    this.$angSearch = document.getElementById('ang-input');
    this.$searchType = document.getElementById('search-type');
    this.$searchSource = document.getElementById('search-source');
    this.$dbDownloadProgress = document.getElementById('db-download-progress');
    this.$results = document.getElementById('results');
    this.$session = document.getElementById('session');
    this.$sessionContainer = document.querySelector('#session-page .block-list');
    this.$shabad = document.getElementById('shabad');
    this.$shabadContainer = document.querySelector('#shabad-page .block-list');
    this.$gurmukhiKB = document.getElementById('gurmukhi-keyboard');
    this.$kbPages = this.$gurmukhiKB.querySelectorAll('.page');
    this.$navPages = document.querySelectorAll('.nav-page');
    this.$navPageLinks = document.querySelectorAll('#footer .menu-group-left a');

    this.navPage('search');
    this.searchType = parseInt(store.get('searchOptions.searchType'), 10);

    if (this.searchType <= 2) {
      gurmukhiInputs.value = this.searchType;
    } else {
      englishInputs.value = this.searchType;
    }

    this.searchLanguage = store.get('searchOptions.searchLanguage');
    searchLanguage.querySelector(`input[value=${this.searchLanguage}]`).checked = true;
    this.changeSearchLanguage(this.searchLanguage);
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
    this.$search.dataset.databaseState = 'loaded';
    this.$angSearch.disabled = false;
    this.$search.focus();
    this.changeSearchType(this.searchType);
    this.changeSearchSource(this.searchSource);
  },

  updateDLProgress(state) {
    this.$dbDownloadProgress.style.height = '2px';
    this.$dbDownloadProgress.style.width = `${state.percent * 100}%`;
  },

  focusSearch() {
    // open the Gurmukhi keyboard if it was previously open
    if (store.get('gurmukhiKB')) {
      this.openGurmukhiKB();
    }
  },

  typeSearch(e) {
    // if a key is pressed in the Gurmukhi KB or is one of the allowed keys
    if (e === 'gKB' || (e.which <= 90 && e.which >= 48) || allowedKeys.indexOf(e.which) > -1) {
      // don't search if there is less than a 100ms gap in between key presses
      clearTimeout(newSearchTimeout);
      newSearchTimeout = setTimeout(() => {
        this.searchType = store.get('searchOptions.searchType');
        this.search(e);
      }, 100);
      this.$angSearch.value = '';
    }
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
    const currentSearchType = gurmukhiSearchText[value] || englishSearchText[value];
    if (currentSearchType === 'FLS') {
      this.$search.placeholder = 'First Letter (Start)';
    } else if (currentSearchType === 'FLA') {
      this.$search.placeholder = 'First Letter (Anywhere)';
    } else {
      this.$search.placeholder = currentSearchType;
    }
    this.$search.focus();
  },

  searchByAng() {
    this.searchType = 4;
    this.search();
    this.$search.value = '';
  },

  changeSearchSource(value) {
    this.searchSource = value;
    currentMeta.source = value === 'all' ? null : value;
    store.set('searchOptions.searchSource', this.searchSource);
    analytics.trackEvent('search', 'searchSource', this.searchSource);
    this.search();
  },

  changeSearchLanguage(value) {
    document.getElementById('search-type').innerHTML = '';
    if (value === 'gr') {
      document.getElementById('search-type').appendChild(gurmukhiInputs);
      this.changeSearchType(parseInt(gurmukhiInputs.value, 10));
    } else if (value === 'en') {
      document.getElementById('search-type').appendChild(englishInputs);
      this.changeSearchType(parseInt(englishInputs.value, 10));
    }
    store.set('searchOptions.searchLanguage', value);
  },

  toggleGurmukhiKB() {
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
    analytics.trackEvent('search', 'gurmukhi-keyboard', 'opened');
  },

  closeGurmukhiKB() {
    this.$navigator.classList.remove('kb-active');
  },

  clickKBButton(e, action = false) {
    const button = e.currentTarget;
    if (action) {
      if (action === 'bksp') {
        this.$search.value = this.$search.value.substring(0, this.$search.value.length - 1);
        this.typeSearch('gKB');
      } else if (action === 'close') {
        this.toggleGurmukhiKB();
      } else if (action.includes('page')) {
        Array.from(this.$kbPages).forEach(el => {
          el.classList.remove('active');
        });
        document.getElementById(`gurmukhi-keyboard-${action}`).classList.add('active');
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

  search(e, pasteTrigger) {
    const { searchType } = this;
    let searchValue;
    if (searchType === 4) {
      searchValue = this.$angSearch.value;
    } else {
      searchValue = this.$search.value;
    }

    const searchQuery = pasteTrigger ? e.clipboardData.getData('Text') : searchValue;

    if (searchQuery.length >= 1) {
      banidb
        .query(searchQuery, searchType, this.searchSource)
        .then(rows => this.printResults(rows));
    } else {
      this.$results.innerHTML = '';
    }
  },

  akhandPaatt,

  printResults(rows) {
    if (rows.length > 0) {
      document.getElementById('search-options').style.display = 'block';
      this.$results.innerHTML = '';
      rows.forEach(item => {
        const resultNode = [];
        resultNode.push(h('span.gurmukhi', item.Gurmukhi));
        resultNode.push(h('span.transliteration.roman', item.Transliteration));
        resultNode.push(h('span.translation.english.roman', item.English));
        resultNode.push(
          h(
            'span.meta.roman',
            `${sources[item.SourceID]} - ${item.PageNo} - ${item.RaagEnglish} - ${
              item.WriterEnglish
            }`,
          ),
        );
        const result = h(
          'li',
          {},
          h(
            'a.panktee.search-result',
            {
              onclick: ev => {
                this.clickResult(ev, item.Shabads[0].ShabadID, item.ID, item);
                global.core.updateInsertedSlide(false);
              },
            },
            resultNode,
          ),
        );
        this.$results.appendChild(result);
      });
      document.getElementById('search-options').style.display = 'block';
    } else {
      this.$results.innerHTML = '';
      this.$results.appendChild(h('li.roman', h('span', 'No results')));
      if (this.searchSource === CONSTS.SOURCE_TYPES.ALL_SOURCES) {
        document.getElementById('search-options').style.display = 'none';
      }
    }
  },

  addToHistory(SearchID, MainLineID, SearchTitle, type = 'shabad') {
    const sessionKey = `${type}-${SearchID}`;
    const sessionItem = h(
      `li#session-${type}-${SearchID}`,
      {},
      h(
        'a.panktee.current',
        {
          onclick: ev => {
            const $panktee = ev.target;
            const { resumePanktee } = sessionStatesList[sessionKey];
            const resumePankteeLineID = resumePanktee ? resumePanktee.split('-')[0] : MainLineID;
            switch (type) {
              case 'bani':
                this.loadBani(SearchID, resumePankteeLineID, true);
                break;
              case 'ceremony':
                this.loadCeremony(SearchID, resumePankteeLineID, true);
                break;
              default:
                this.loadShabad(SearchID, resumePankteeLineID);
            }
            const sessionLines = this.$session.querySelectorAll('a.panktee');
            Array.from(sessionLines).forEach(el => el.classList.remove('current'));
            $panktee.classList.add('current');
            this.navPage('shabad');
          },
        },
        SearchTitle,
      ),
    );
    // get all the lines in the session block and remove the .current class from them
    const sessionLines = this.$session.querySelectorAll('a.panktee');
    Array.from(sessionLines).forEach(el => el.classList.remove('current'));
    // if the ShabadID of the clicked Panktee isn't in the sessionList variable,
    // add it to the variable
    if (sessionList.indexOf(sessionKey) < 0) {
      sessionList.push(sessionKey);
      sessionStatesList[sessionKey] = {
        resumePanktee: null,
        mainPanktee: MainLineID,
        seenPanktees: new Set(),
      };
    } else {
      // if the ShabadID is already in the session, just remove the HTMLElement,
      // and leave the sessionList
      const line = this.$session.querySelector(`#session-${type}-${SearchID}`);
      this.$session.removeChild(line);
    }
    // add the line to the top of the session block
    this.$session.insertBefore(sessionItem, this.$session.firstChild);
  },

  clickResult(e, ShabadID, LineID, Line) {
    document.body.classList.remove('home');
    this.closeGurmukhiKB();
    this.addToHistory(ShabadID, LineID, Line.Gurmukhi);
    // are we in APV
    const apv = document.body.classList.contains('akhandpaatt');
    // load the Shabad into the controller
    this.loadShabad(ShabadID, LineID, apv);
    // scroll the session block to the top to see the highlighted line
    this.$sessionContainer.scrollTop = 0;
    this.navPage('shabad');

    const { searchType } = this;
    let searchValue;
    if (searchType === 4) {
      searchValue = this.$angSearch.value;
    } else {
      searchValue = this.$search.value;
    }
    analytics.trackEvent('search', CONSTS.SEARCH_TEXTS[searchType], searchValue);
    analytics.trackEvent('shabad', ShabadID, LineID);
  },

  loadShabad(ShabadID, LineID, apv = false) {
    if (window.socket !== undefined) {
      window.socket.emit('data', {
        type: 'shabad',
        id: ShabadID,
        shabadid: ShabadID, // @deprecated
        highlight: LineID,
      });
    }

    // clear the Shabad controller and empty out the currentShabad array
    const $shabadList = this.$shabad || document.getElementById('shabad');
    $shabadList.dataset.bani = '';
    $shabadList.innerHTML = '';
    currentShabad.splice(0, currentShabad.length);
    if (apv && infiniteScroll) {
      banidb
        .getAng(ShabadID)
        .then(ang => {
          currentMeta = ang;
          return banidb.loadAng(ang.PageNo, ang.SourceID);
        })
        .then(rows => this.printShabad(rows, ShabadID, LineID));
    } else {
      banidb.loadShabad(ShabadID, LineID).then(rows => this.printShabad(rows, ShabadID, LineID));
    }
  },

  async loadCeremony(ceremonyID, LineID = null, historyReload = false) {
    const $shabadList = this.$shabad || document.getElementById('shabad');
    $shabadList.innerHTML = '';
    $shabadList.dataset.bani = '';
    try {
      const rowsDb = await banidb.loadCeremony(ceremonyID);
      const rows = await Promise.all(
        rowsDb.map(rowDb => {
          let row = rowDb;

          if (rowDb.Verse) {
            row = rowDb.Verse;
          }

          if (rowDb.Custom && rowDb.Custom.ID) {
            row = rowDb.Custom;
            row.shabadID = `ceremony-${rowDb.Ceremony.Token}`;
          }

          if (rowDb.VerseRange && rowDb.VerseRange.length) {
            row = [...rowDb.VerseRange];
          }

          if (rowDb.VerseIDRangeStart && rowDb.VerseIDRangeEnd) {
            row = banidb.loadVerses(rowDb.VerseIDRangeStart, rowDb.VerseIDRangeEnd);
          }
          row.sessionKey = `ceremony-${ceremonyID}`;
          return row;
        }),
      );
      const flatRows = [].concat(...rows);
      const nameOfCeremony = rowsDb[0].Ceremony.Gurmukhi;
      if (!historyReload) {
        this.addToHistory(ceremonyID, null, nameOfCeremony, 'ceremony');
      }
      if (window.socket !== undefined) {
        window.socket.emit('data', {
          type: 'ceremony',
        });
      }
      return this.printShabad(flatRows, null, LineID);
    } catch (error) {
      throw error;
    }
  },

  loadBani(BaniID, LineID = null, historyReload = false) {
    const $shabadList = this.$shabad || document.getElementById('shabad');
    const baniLength = store.get('userPrefs.toolbar.gurbani.bani-length');
    const mangalPosition = store.get('userPrefs.toolbar.gurbani.mangal-position');

    let blackListedMangalPosition;
    if (mangalPosition === 'above') {
      blackListedMangalPosition = 'current';
    } else if (mangalPosition === 'current') {
      blackListedMangalPosition = 'above';
    }
    // translate user settings into its respective database fields
    const baniLengthCols = {
      short: 'existsSGPC',
      medium: 'existsMedium',
      long: 'existsTaksal',
      extralong: 'existsBuddhaDal',
    };
    $shabadList.innerHTML = '';
    $shabadList.dataset.bani = BaniID;
    currentShabad.splice(0, currentShabad.length);
    // load verses for bani based on baniID and the length that user has decided
    banidb.loadBani(BaniID, baniLengthCols[baniLength]).then(rowsDb => {
      // create a unique shabadID for whole bani, and append it with length
      const shabadID = `${rowsDb[0].Token || rowsDb[0].Bani.Token}-${baniLength}-${rowsDb[0]
        .BaniID || rowsDb[0].Bani.ID}`;
      const nameOfBani = rowsDb[0].nameOfBani || rowsDb[0].Bani.Gurmukhi;
      const thisBaniState = sessionStatesList[`bani-${BaniID}`];
      if (!historyReload) {
        if (thisBaniState && thisBaniState.resumePanktee && !LineID) {
          thisBaniState.resumePanktee = `${rowsDb[0].ID}-1`;
          thisBaniState.seenPanktees = new Set(`${rowsDb[0].ID}-1`);
        } else {
          this.addToHistory(BaniID, null, nameOfBani, 'bani');
        }
      }
      const rows = rowsDb
        .filter(rowDb => rowDb.MangalPosition !== blackListedMangalPosition)
        .map(rowDb => {
          let row = rowDb;
          // when object from db is not a verse itself
          if (rowDb.Verse) {
            row = rowDb.Verse;
          }
          // when its a custom panktee (decorator, bani heading, etc)
          if (rowDb.Custom) {
            row = rowDb.Custom;
            row.shabadID = rowDb.Bani.Token;
          }

          row.sessionKey = `bani-${BaniID}`;

          return row;
        });
      if (window.socket !== undefined) {
        window.socket.emit('data', {
          type: 'bani',
          id: BaniID,
          highlight: LineID || rows[0].ID,
        });
      }
      return this.printShabad(rows, shabadID, LineID);
    });
  },

  loadAng(PageNo, SourceID) {
    banidb.loadAng(PageNo, SourceID).then(rows => this.printShabad(rows));
  },

  loadAdjacentShabad(Forward = true) {
    const FirstLine = currentShabad[0];
    const LastLine = currentShabad[currentShabad.length - 1];
    this.$shabad.innerHTML = '';
    currentShabad.splice(0, currentShabad.length);
    // Load the same shabad if on first or last shabad
    const PreviousVerseID = FirstLine === 1 ? FirstLine : FirstLine - 1;
    const NextVerseID = LastLine === 60403 ? LastLine : LastLine + 1;
    const adjacentVerseID = Forward ? NextVerseID : PreviousVerseID;
    let adjacentShabadID;
    banidb
      .getShabad(adjacentVerseID)
      .then(ShabadID => {
        adjacentShabadID = ShabadID;
        return banidb.loadShabad(ShabadID);
      })
      .then(rows => {
        this.printShabad(rows, adjacentShabadID);
      });
  },

  lineFactory(line, rows) {
    const mainLineExists = !!document.querySelector('.main');
    const englishHeadingEl = document.createElement('span');
    const lineSessionID = `${line.ID}-${line.lineCount}`;
    englishHeadingEl.innerHTML = line.English;
    const englishHeading = englishHeadingEl.querySelector('h1')
      ? englishHeadingEl.querySelector('h1').innerText
      : '';

    let englishAllowed = store.getUserPref(`gurbani.ceremonies.${line.ShabadID}-english`);
    if (englishAllowed === undefined) {
      englishAllowed = true;
    }

    if (englishHeading && !englishAllowed) {
      return false;
    }

    let seenClasses = '';
    const shabadState = sessionStatesList[line.sessionKey || `shabad-${line.ShabadID}`];
    if (shabadState && shabadState.resumePanktee) {
      if (shabadState.seenPanktees.has(lineSessionID) || shabadState.seenPanktees.has(line.ID)) {
        seenClasses = '.seen_check';
      }
      if (shabadState.resumePanktee === lineSessionID) {
        seenClasses += '.current';
      }
      if (shabadState.mainPanktee === line.ID && !mainLineExists) {
        seenClasses += '.main.seen_check';
      }
    } else if (line.mainLine && !mainLineExists) {
      seenClasses += '.main.current.seen_check';
    }

    const shabadLine = h(
      `li#li_${line.lineCount}`,
      {
        'data-line-count': line.lineCount,
      },
      h(
        `a#line${line.ID}.panktee.${englishHeading ? 'roman' : 'gurmukhi'}${seenClasses}`,
        {
          'data-line-id': line.ID,
          'data-main-letters': line.MainLetters,
          onclick: e => {
            this.clickShabad(e, line.ShabadID, line.ID, line, rows, 'click');
            global.core.updateInsertedSlide(false);
          },
        },
        [h('i.fa.fa-fw.fa-check'), h('i.fa.fa-fw.fa-home'), ' ', line.Gurmukhi || englishHeading],
      ),
    );
    return shabadLine;
  },

  printShabad(rows, ShabadID, LineID, start = 0, fromScroll = false) {
    const shabadState = sessionStatesList[rows[0].sessionKey || `shabad-${ShabadID}`];
    let lineID = LineID || rows[0].ID;
    const shabadID =
      ShabadID || rows[0].shabadID || (rows[0].Shabads ? rows[0].Shabads[0].ShabadID : '');
    const lineIndex = rows.findIndex(row => row.ID === parseInt(lineID, 10));
    const shabad = this.$shabad;
    const apv = document.body.classList.contains('akhandpaatt');

    // if the line clicked is further than throughput (in searches) then load until that line
    let throughput = 50;

    if (start) {
      throughput = 10;
    } else if (lineIndex > throughput) {
      throughput = lineIndex + 1;
    }

    const end = start + throughput;

    const lineHeight = 27;
    // max scroll size, after which we would load the next part of bani
    const maxScrollSize = end * lineHeight * 0.75;
    // mode in which bani is printed, can be append, replace and click
    const mode = start ? 'append' : 'replace';

    let lineCount = start;
    let mainLine = rows[0];

    // remove currently printed shabad if not in apv mode.
    if (!apv && !start) {
      while (shabad.firstChild) {
        shabad.removeChild(shabad.firstChild);
      }
    }

    // print the next set of banis on scroll
    shabad.parentNode.onscroll = e => {
      let newStart = end;
      let tooFar = e.target.scrollTop > (end + throughput) * lineHeight;
      // if scrolled too far, too fast, then load all the verses to fill the area scrolled.
      if (tooFar) {
        while (tooFar) {
          this.printShabad(rows, ShabadID, lineID, newStart, true);
          newStart += throughput;
          tooFar = e.target.scrollTop > (newStart + throughput) * lineHeight;
        }
      } else if (e.target.scrollTop >= maxScrollSize) {
        this.printShabad(rows, ShabadID, lineID, end, true);
      }
    };

    const currentRows = rows.slice(start, end);
    let lineIDConflict = false;

    currentRows.forEach(rawItem => {
      lineCount += 1;
      const item = rawItem;
      item.lineCount = lineCount;

      if (parseInt(lineID, 10) === item.ID) {
        mainLine = item;
        item.mainLine = true;
      }

      item.ShabadID = item.ShabadID || shabadID;

      const thisLine = this.lineFactory(item, currentRows, mode);
      // if thisLine is english and englishExplanation is off then don't append this line
      if (thisLine) {
        // write the Panktee to the controller
        shabad.appendChild(thisLine);
        // append the currentShabad array
        currentShabad.push(item.ID);
        if (lineID === item.ID) {
          this.currentLine = item.ID;
        }
      } else if (!thisLine && item.ID === lineID) {
        // if the line we are ignoring is the first line (main line) then toggle lineIDConflict
        lineIDConflict = true;
      }
    });

    if (shabadState && !shabadState.mainPanktee) {
      shabadState.mainPanktee = mainLine.ID;
    }

    // if there is a lineIDConflict make lineID the very first line in shabad.
    if (lineIDConflict) {
      lineID = document.querySelector(`#shabad > li:first-child > a`).dataset.lineId;
      shabad.querySelector(`#line${lineID}`).classList.add('current', 'main', 'seen_check');
      if (sessionStatesList[shabadID]) {
        sessionStatesList[shabadID].seenPanktees.add(lineID);
      }
    }

    const totalLines = rows.length;
    const pendingLines = totalLines - end;
    if (shabad.querySelector('.empty-space')) {
      shabad.querySelector('.empty-space').remove();
    }
    const emptySpace = h('div.empty-space', {
      style: { height: `${pendingLines * lineHeight}px` },
    });

    shabad.appendChild(emptySpace);

    // scroll the Shabad controller to the current Panktee
    const $curPanktee = shabad.querySelector('.current');
    if ($curPanktee && !start) {
      const curPankteeTop = $curPanktee.parentNode.offsetTop;
      this.$shabadContainer.scrollTop = curPankteeTop;
    }
    // send the line to app.js, which will send it to the viewer window as well as obs file
    global.controller.sendLine(shabadID, lineID, mainLine, currentRows, mode, start, fromScroll);

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
      // clear object and its properties
      Object.getOwnPropertyNames(sessionStatesList).forEach(shabadID => {
        delete sessionStatesList[shabadID];
      });
    }
  },

  checkAutoPlay(LineID = null) {
    clearTimeout(autoplaytimer);
    if (LineID === null && document.body.querySelector('#shabad li')) {
      document.body.querySelector('#shabad .panktee.current').click();
    }
    const bodyClassList = document.body.classList;
    const delay = [...bodyClassList]
      .find(value => /^autoplayTimer-/.test(value))
      .replace('autoplayTimer-', '');
    if (
      bodyClassList.contains('autoplay') &&
      LineID !== currentShabad[currentShabad.length - 1] &&
      LineID !== null
    ) {
      autoplaytimer = setTimeout(() => {
        document.getElementById(`line${LineID + 1}`).click();
      }, delay * 1000);
    }
  },

  clickShabad(e, ShabadID, LineID, Line, rows, mode = 'click') {
    if (window.socket !== undefined) {
      let shabadIdsplit = [ShabadID];
      if (typeof ShabadID === 'string') {
        shabadIdsplit = ShabadID.split('-');
      }

      let shabadType;

      if (shabadIdsplit.length > 1) {
        shabadType = shabadIdsplit[0] === 'ceremony' ? 'ceremony' : 'bani';
      } else {
        shabadType = 'shabad';
      }

      window.socket.emit('data', {
        type: shabadType,
        id: shabadIdsplit.length > 1 ? parseInt(shabadIdsplit[2], 10) : ShabadID,
        baniLength: shabadIdsplit.length > 1 ? shabadIdsplit[1] : undefined,
        shabadid: ShabadID, // @deprecated
        highlight: LineID,
      });
    }

    const lines = this.$shabad.querySelectorAll('a.panktee');
    const shabadState = sessionStatesList[Line.sessionKey || `shabad-${ShabadID}`];
    if (e.target.classList.contains('fa-home')) {
      // Change main line
      const $panktee = e.target.parentNode;
      Array.from(lines).forEach(el => el.classList.remove('main'));
      $panktee.classList.add('main', 'seen_check');
      shabadState.seenPanktees.add(`${LineID}-${Line.lineCount}`);
    } else if (e.target.classList.contains('panktee')) {
      // Change line to click target
      const $panktee = e.target;
      this.currentLine = LineID;
      global.controller.sendLine(ShabadID, LineID, Line, rows, mode);
      // Remove 'current' class from all Panktees
      Array.from(lines).forEach(el => el.classList.remove('current'));
      // Add 'current' and 'seen-check' to selected Panktee
      $panktee.classList.add('current', 'seen_check');
      shabadState.seenPanktees.add(`${LineID}-${Line.lineCount}`);
      shabadState.resumePanktee = `${LineID}-${Line.lineCount}`;
    }
    this.checkAutoPlay(LineID);
  },

  navPage(page) {
    this.activateNavLink(page);
    this.activateNavPage(page);
  },

  activateNavLink(page, tab = false) {
    this.$navPageLinks.forEach($navPageLink => {
      $navPageLink.classList.remove('active');
    });
    document.querySelector(`#${page}-pageLink`).classList.add('active');

    if (tab) {
      document.querySelector('.nav-header-tab.active').classList.remove('active');
      document.getElementById(`${page}-tab`).classList.add('active');
    }
  },

  activateNavPage(page, tab = null) {
    this.$navPages.forEach($navPage => {
      $navPage.classList.remove('active');
    });

    document.querySelector(`#${page}-page`).classList.add('active');

    if (tab) {
      document.querySelector('.tab-content.active').classList.remove('active');
      document.querySelector(`#${tab.id}-tab-content`).classList.add('active');
      document.querySelector('#session-page .nav-header-text').innerText = tab.label;
    }
  },
};
