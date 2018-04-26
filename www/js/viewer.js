/* eslint
  global-require: 0,
  import/no-unresolved: 0,
  no-inner-declarations: 0,
  no-use-before-define: 0
*/
global.platform = require('./js/desktop_scripts');
const h = require('hyperscript');
const Noty = require('noty');
const scroll = require('scroll');
const core = require('./js/index');

let prefs = JSON.parse(window.localStorage.getItem('prefs'));

if (window.localStorage.getItem('customTheme')) {
  try {
    const userTheme = JSON.parse(window.localStorage.getItem('customTheme'));
    applyTheme(userTheme);
  } catch (error) {
    new Noty({
      type: 'error',
      text: `There is an error getting custom theme.
      Try checking theme file for errors. If error persists,
      report it at www.sttm.co`,
      timeout: 5000,
      modal: true,
    }).show();
  }
}

let isWebView = false;
let apv = false;
let $apv;
let $apvObserver;
let $apvObserving;
const apvPages = {};
const apvCur = {};

const decks = [];
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

// IPC
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
  prefs = JSON.parse(window.localStorage.getItem('prefs'));
  core.menu.settings.applySettings(prefs);
});

global.platform.ipc.on('update-theme', () => {
  try {
    const userTheme = JSON.parse(window.localStorage.getItem('customTheme'));
    applyTheme(userTheme);
  } catch (error) {
    // if there's an error, empty the custom theme object
    window.localStorage.setItem('customTheme', '');
    new Noty({
      type: 'error',
      text: `There is an error updating custom theme.
      Try checking theme file for errors. If error persists,
      report it at www.sttm.co`,
      timeout: 5000,
      modal: true,
    }).show();
  }
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
      });
      resolve({ cards, lines });
    }
  });
}

function createDeck(cards, curSlide, ShabadID) {
  hideDecks();
  $viewer.appendChild(h(`div#shabad${ShabadID}.deck.active`, cards));
  smoothScroll(curSlide);
  currentShabad = parseInt(ShabadID, 10);
  decks.push(ShabadID);
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
  } else if (decks.indexOf(newShabadID) > -1) {
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
  } else {
    global.platform.db.all(`SELECT v.ID, v.Gurmukhi, v.English, v.transliteration, v.PunjabiUni FROM Verse v LEFT JOIN Shabad s ON v.ID = s.VerseID WHERE s.ShabadID = ${newShabadID} ORDER BY v.ID ASC`,
      (err, rows) => {
        createCards(rows, LineID)
          .then(({ cards }) => createDeck(cards, LineID, ShabadID));
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
}

function applyTheme(theme) {
  let css = `
    body.custom-theme {
      background-color: ${theme['background-color']};
      background-image: url(../assets/custom_backgrounds/${theme['background-image']});
    }
    .deck {
      text-shadow: 1px 1px 2px rgba(0,0,0,0.3);
    }
    .deck .gurbani {
      -webkit-filter: drop-shadow(${theme['gurbani-shadow']});
    }`;
  Object.keys(theme).forEach((themeParam) => {
    const elementClass = themeParam.split('-')[0];
    css += `body.custom-theme .${elementClass} { color: ${theme[themeParam]}}`;
  });
  const style = document.querySelector('style') || document.createElement('style');
  style.type = 'text/css';
  style.innerHTML = css;
  document.head.appendChild(style);
}
