/* eslint
  global-require: 0,
  import/no-unresolved: 0,
  no-inner-declarations: 0,
  no-use-before-define: 0,
  no-undef: 0
*/
global.platform = require('./js/desktop_scripts');
const h = require('hyperscript');
const scroll = require('scroll');
const core = require('./js/index');
const { store } = require('electron').remote.require('./app');
const themes = require('./js/themes.json');

let prefs = store.get('userPrefs');

let isWebView = false;
let apv = false;
let $apv;
let $apvObserver;
let $apvObserving;
let castCur = {};
const apvPages = {};
const apvCur = {};

const decks = {};
let currentShabad;
const $message = document.getElementById('message');
const $body = document.body;
const $viewer = document.getElementById('viewer');
const $scroll = window;

$body.classList.add(process.platform);

core.menu.settings.applySettings(prefs);

// Synchronize scrolling to presenter window
$scroll.addEventListener('wheel', () => {
  const pos = $body.scrollTop / ($body.scrollHeight - $body.offsetHeight);
  const sendMethod = isWebView ? 'sendToHost' : 'send';
  global.platform.ipc[sendMethod]('scroll-pos', pos);
}, {
  capture: true,
  passive: true,
});

function hideDecks() {
  Array.from(document.querySelectorAll('.deck')).forEach((el) => {
    el.classList.remove('active');
  });
}

function castToReceiver() {
  castCur.prefs = store.get('userPrefs');
  sendMessage(JSON.stringify(castCur));
}

function castShabadLine(lineID) {
  castCur = decks[currentShabad][lineID];
  let nextLine = '';
  if (decks[currentShabad][lineID + 1]) {
    nextLine = decks[currentShabad][lineID + 1].gurmukhi;
  }
  castCur.nextLine = nextLine;
  castToReceiver();
}

function castText(text, isGurmukhi) {
  castCur = {};
  castCur.showInEnglish = isGurmukhi !== true;
  castCur.gurmukhi = text;
  castCur.larivaar = text;
  castToReceiver();
}

// IPC
global.platform.ipc.on('search-cast', (event, pos) => {
  requestSession();
  appendMessage(event);
  appendMessage(pos);
});

global.platform.ipc.on('stop-cast', () => {
  stopApp();
});

global.platform.ipc.on('is-webview', () => {
  isWebView = true;
  document.body.classList.add('webview');
});

global.platform.ipc.on('clear-apv', () => {
  apv = document.body.classList.contains('akhandpaatt');
  if (apv) {
    hideDecks();
  }
  if ($apv) {
    $apv.innerHTML = '';
  }
  Object.keys(apvCur).forEach((key) => {
    delete apvCur[key];
  });
  Object.keys(apvPages).forEach((key) => {
    delete apvPages[key];
  });
});

global.platform.ipc.on('show-line', (event, data) => {
  apv = document.body.classList.contains('akhandpaatt');
  showLine(data.shabadID, data.lineID);
});

global.platform.ipc.on('show-ang', (event, data) => {
  apv = document.body.classList.contains('akhandpaatt');
  showAng(data.PageNo, data.SourceID);
});

global.platform.ipc.on('show-text', (event, data) => {
  showText(data.text, data.isGurmukhi);
});

global.platform.ipc.on('send-scroll', (event, pos) => {
  $scroll.scrollTo(0,
    (document.documentElement.scrollHeight - document.documentElement.offsetHeight) * pos);
});

global.platform.ipc.on('update-settings', () => {
  prefs = store.get('userPrefs');
  const themeKeys = themes.map(item => item.key);

  $body.classList.remove(...themeKeys);
  $body.classList.add(prefs.app.theme);
  core.menu.settings.applySettings(prefs);
  castToReceiver();
});

function nextAng() {
  const next = apvCur.PageNo + 1;
  $apvObserver.unobserve($apvObserving);
  showAng(next, apvCur.SourceID);
  global.platform.ipc.send('next-ang', { PageNo: next, SourceID: apvCur.SourceID });
}

function createAPVContainer() {
  if (!$apv) {
    $apv = document.createElement('div');
    $apv.id = 'apv';
    $apv.classList.add('deck');
    $viewer.appendChild($apv);
    if (isWebView) {
      $apvObserver = new IntersectionObserver(nextAng);
    }
  }
  if (!$apv.classList.contains('active')) {
    hideDecks();
    $apv.classList.add('active');
  }
}

function createCards(rows, LineID) {
  return new Promise((resolve) => {
    if (rows.length > 0) {
      const cards = [];
      const lines = [];
      const shabad = {};
      rows.forEach((row) => {
        lines.push(row.ID);
        const gurmukhiShabads = row.Gurmukhi.split(' ');
        const taggedGurmukhi = [];
        gurmukhiShabads.forEach((val, index) => {
          if (val.indexOf(']') !== -1) {
            taggedGurmukhi[index - 1] = `<span>${taggedGurmukhi[index - 1]}<i> </i>${val}</span>`;
          } else {
            taggedGurmukhi[index] = val;
          }
        });
        const gurmukhiContainer = document.createElement('div');
        gurmukhiContainer.innerHTML = `<span class="padchhed">${taggedGurmukhi.join(' ')}</span><span class="larivaar">${taggedGurmukhi.join('<wbr>')}</span>`;
        cards.push(
          h(
            `div#slide${row.ID}.slide${row.ID === LineID ? '.active' : ''}`,
            [
              h('h1.gurbani.gurmukhi', gurmukhiContainer),
              h('h2.translation', row.English),
              h('h2.teeka', row.PunjabiUni),
              h('h2.transliteration', row.Transliteration),
            ]));
        shabad[row.ID] = {
          gurmukhi: row.Gurmukhi,
          larivaar: taggedGurmukhi.join('<wbr>'),
          translation: row.English,
          teeka: row.Punjabi,
          transliteration: row.Transliteration,
        };
      });
      resolve({ cards, lines, shabad });
    }
  });
}

function createDeck(cards, curSlide, shabad, ShabadID) {
  hideDecks();
  $viewer.appendChild(h(`div#shabad${ShabadID}.deck.active`, cards));
  smoothScroll(curSlide);
  currentShabad = parseInt(ShabadID, 10);
  decks[ShabadID] = shabad;
  castShabadLine(curSlide);
}

function showAng(PageNo, SourceID, LineID) {
  global.platform.search.loadAng(PageNo, SourceID)
    .then(res => createCards(res, LineID))
    .then(({ cards, lines }) => {
      apvCur.PageNo = PageNo;
      apvCur.SourceID = SourceID;
      apvPages[PageNo] = lines;
      cards.forEach(card => $apv.appendChild(card));
      hideDecks();
      $apv.classList.add('active');
      if (isWebView) {
        $apvObserving = document.querySelector(`#apv #slide${lines[lines.length - 3]}`);
        $apvObserver.observe($apvObserving);
      }
      if (LineID) {
        setTimeout(() => smoothScroll(`#apv #slide${LineID}`), 100);
      }
    });
}

function smoothScroll(pos = 0) {
  let newScrollPos;
  switch (typeof pos) {
    case 'object':
      newScrollPos = pos.offsetTop - 200;
      break;
    case 'string':
      newScrollPos = document.querySelector(pos).offsetTop - 200;
      break;
    default:
      newScrollPos = pos;
      break;
  }
  scroll.top($body, newScrollPos);
}

function showLine(ShabadID, LineID) {
  if (!global.platform.db) {
    global.platform.initDB();
  }
  const newShabadID = parseInt(ShabadID, 10);
  if (apv) {
    createAPVContainer();
    if (!apvCur.ShabadID || apvCur.ShabadID !== ShabadID) {
      global.platform.search.getAng(ShabadID)
        .then(ang => showAng(ang.PageNo, ang.SourceID, LineID));
      apvCur.ShabadID = ShabadID;
    } else {
      smoothScroll(`#apv #slide${LineID}`);
    }
    castShabadLine(LineID);
  } else if (newShabadID in decks) {
    const $shabadDeck = document.getElementById(`shabad${newShabadID}`);
    if (currentShabad !== newShabadID || !$shabadDeck.classList.contains('active')) {
      hideDecks();
      $shabadDeck.classList.add('active');
      currentShabad = newShabadID;
    }
    [...$shabadDeck.querySelectorAll('.slide')].forEach(el => el.classList.remove('active'));
    const line = document.getElementById(`slide${LineID}`);
    line.classList.add('active');
    smoothScroll(line);
    castShabadLine(LineID);
  } else {
    global.platform.db.all(`SELECT v.ID, v.Gurmukhi, v.English, v.transliteration, v.PunjabiUni, v.Punjabi FROM Verse v LEFT JOIN Shabad s ON v.ID = s.VerseID WHERE s.ShabadID = ${newShabadID} ORDER BY v.ID ASC`,
      (err, rows) => {
        createCards(rows, LineID)
          .then(({ cards, shabad }) => createDeck(cards, LineID, shabad, newShabadID));
      });
  }
}

function showText(text, isGurmukhi = false) {
  hideDecks();
  $message.classList.add('active');
  while ($message.firstChild) {
    $message.removeChild($message.firstChild);
  }
  const textNode = isGurmukhi ? h('h1.gurmukhi.gurbani', text) : h('h1.gurbani', text);
  $message.appendChild(h('div.slide.active', textNode));
  castText(text, isGurmukhi);
}
