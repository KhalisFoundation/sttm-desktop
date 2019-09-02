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
const { remote } = require('electron');
const { store } = require('electron').remote.require('./app');
const slash = require('./js/slash');
const core = require('./js/index');
const themes = require('./js/themes.json');

const analytics = remote.getGlobal('analytics');
let prefs = store.get('userPrefs');

let isWebView = false;
let apv = false;
const infiniteScroll = false;
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
$scroll.addEventListener(
  'wheel',
  () => {
    const pos = $body.scrollTop / ($body.scrollHeight - $body.offsetHeight);
    const sendMethod = isWebView ? 'sendToHost' : 'send';
    global.platform.ipc[sendMethod]('scroll-pos', pos);
  },
  {
    capture: true,
    passive: true,
  },
);

const hideDecks = () => {
  Array.from(document.querySelectorAll('.deck')).forEach(el => {
    el.classList.remove('active');
  });
};

const activateSlide = ($deck, LineID) => {
  [...$deck.querySelectorAll('.slide')].forEach(el => el.classList.remove('active'));
  const line = document.querySelector(`.deck.active #slide${LineID}`);
  if (line) {
    line.classList.add('active');
    smoothScroll(line);
    castShabadLine(LineID);
  }
};

const castToReceiver = () => {
  castCur.prefs = store.get('userPrefs');
  sendMessage(JSON.stringify(castCur));
};

const castShabadLine = lineID => {
  document.querySelector('.viewer-controls').innerHTML = '';
  // make sure that the deck is created before attempting to cast it.
  if (decks && decks[currentShabad]) {
    let nextLine = '';
    if (decks[currentShabad][lineID + 1]) {
      nextLine = decks[currentShabad][lineID + 1].gurmukhi;
    }
    castCur = Object.assign(decks[currentShabad][lineID], {
      nextLine,
      gurmukhi: decks[currentShabad][lineID].gurmukhi,
    });
    castToReceiver();

    const activeSlide = document.querySelector('.deck.active .slide.active');
    if (activeSlide) {
      Array.prototype.forEach.call(activeSlide.children, element => {
        const icons = iconsetHtml(`icons-${element.classList[0]}`, element.innerHTML);
        if (icons) document.querySelector('.viewer-controls').appendChild(icons);
      });
    }
  }
};

const castText = (text, isGurmukhi) => {
  castCur = {};
  castCur.showInEnglish = isGurmukhi !== true;
  castCur.gurmukhi = text;
  castCur.larivaar = text;
  castCur.isText = true;
  castToReceiver();
};

const applyThemebg = () => {
  if (prefs.app.themebg.url) {
    $body.style.backgroundImage = `url(${slash(prefs.app.themebg.url)})`;
    $body.classList.toggle('show-overlay', prefs.app.themebg.type === 'custom');
  }
};

applyThemebg();

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
  Object.keys(apvCur).forEach(key => {
    delete apvCur[key];
  });
  Object.keys(apvPages).forEach(key => {
    delete apvPages[key];
  });
});

global.platform.ipc.on('show-line', (event, data) => {
  apv = document.body.classList.contains('akhandpaatt');
  showLine(data.shabadID, data.lineID, data.rows, data.mode);
});

global.platform.ipc.on('show-ang', (event, data) => {
  apv = document.body.classList.contains('akhandpaatt');
  showAng(data.PageNo, data.SourceID);
});

global.platform.ipc.on('show-text', (event, data) => {
  document.querySelector('.viewer-controls').innerHTML = '';
  showText(data.text, data.isGurmukhi);
});

global.platform.ipc.on('send-scroll', (event, pos) => {
  $scroll.scrollTo(
    0,
    (document.documentElement.scrollHeight - document.documentElement.offsetHeight) * pos,
  );
});

global.platform.ipc.on('update-settings', () => {
  prefs = store.get('userPrefs');
  const themeKeys = themes.map(item => item.key);
  $body.classList.remove(...themeKeys);
  $body.classList.add(prefs.app.theme);
  applyThemebg();
  core.menu.settings.applySettings(prefs);
  castToReceiver();
});

const nextAng = () => {
  const next = apvCur.PageNo + 1;
  $apvObserver.unobserve($apvObserving);
  showAng(next, apvCur.SourceID);
  global.platform.ipc.send('next-ang', { PageNo: next, SourceID: apvCur.SourceID });
};

const createAPVContainer = () => {
  if (!$apv) {
    $apv = document.createElement('div');
    $apv.id = 'apv';
    $apv.classList.add('deck');
    $viewer.appendChild($apv);
    if (isWebView && infiniteScroll) {
      $apvObserver = new IntersectionObserver(nextAng);
    }
  }
  if (!infiniteScroll) {
    // Clear out APV container if not scrolling infinitely
    $apv.innerHTML = '';
  }
  if (!$apv.classList.contains('active')) {
    hideDecks();
    $apv.classList.add('active');
  }
};

const iconsetHtml = (classname, content) => {
  let icons;
  const iconType = classname.split('-')[1];
  if (content) {
    icons = h(`span.${classname}.iconset`, [
      h('p.tagline', iconType === 'gurbani' ? 'bani' : iconType),
      h(
        'span.visibility',
        {
          onclick: e => core.menu.settings.showHide(e, iconType),
        },
        h('i.fa.fa-eye-slash'),
      ),
      h(
        'span.minus.size',
        {
          onclick: () => core.menu.settings.changeFontSize(iconType, 'minus'),
        },
        h('i.fa.fa-minus-circle'),
      ),
      h(
        'span.plus.size',
        {
          onclick: () => core.menu.settings.changeFontSize(iconType, 'plus'),
        },
        h('i.fa.fa-plus-circle'),
      ),
    ]);
  }
  return icons;
};

const createCards = (rows, LineID) => {
  const cards = [];
  const lines = [];
  const shabad = {};

  Object.keys(rows).forEach(key => {
    const row = rows[key];
    lines.push(row.ID);
    let gurmukhiShabads = [];
    if (row.Gurmukhi) {
      gurmukhiShabads = row.Gurmukhi.split(' ');
      if (row.Visraam) {
        try {
          const visraams = JSON.parse(row.Visraam);
          Object.keys(visraams).forEach(visraamSource => {
            if (visraams[visraamSource]) {
              visraams[visraamSource].forEach(visraam => {
                const visraamShabad = gurmukhiShabads[visraam.p];
                if (typeof visraamShabad === 'string') {
                  const visraamClass = visraam.t === 'v' ? 'visraam-main' : 'visraam-yamki';
                  const visraamEl = document.createElement('span');
                  visraamEl.classList.add(visraamClass, `visraam-${visraamSource}`);
                  visraamEl.innerText = visraamShabad;
                  gurmukhiShabads[visraam.p] = visraamEl;
                } else {
                  gurmukhiShabads[visraam.p].classList.add(`visraam-${visraamSource}`);
                }
              });
            }
          });
        } catch (error) {
          analytics.trackEvent('visraamsFailed', row, error);
        }
      }
    }
    const taggedGurmukhi = [];
    gurmukhiShabads.forEach((val, index) => {
      const valHTML = typeof val === 'string' ? val : val.outerHTML;
      if (valHTML.indexOf(']') !== -1 && taggedGurmukhi.length > 0) {
        taggedGurmukhi[index - 1] = `<span>${taggedGurmukhi[index - 1]}<i> </i>${valHTML}</span>`;
      } else {
        taggedGurmukhi[index] = valHTML;
      }
    });
    const gurmukhiContainer = document.createElement('div');

    const padched = taggedGurmukhi.join(' ');
    const larivaar = taggedGurmukhi.join('<wbr>');

    gurmukhiContainer.innerHTML = `<span class="padchhed">${padched}</span>
                                    <span class="larivaar">${larivaar}</span>`;

    const englishContainer = document.createElement('div');
    englishContainer.innerHTML = row.English || '';

    cards.push(
      h(`div#slide${row.ID}.slide${row.ID === LineID ? '.active' : ''}`, [
        h('h1.gurbani.gurmukhi', gurmukhiContainer),
        h('h2.translation', englishContainer),
        h('h2.teeka', row.Punjabi || ''),
        h('h2.transliteration', row.Transliteration || ''),
      ]),
    );
    shabad[row.ID] = {
      gurmukhi: padched || row.Gurmukhi || row.PunjabiUni,
      larivaar,
      translation: row.English || '',
      teeka: row.Punjabi || '',
      transliteration: row.Transliteration || '',
    };
  });
  return { cards, lines, shabad };
};

const createDeck = (cards, curSlide, shabad, ShabadID, mode) => {
  const $existingDeck = document.querySelector(`div#shabad${ShabadID}.deck.active`);
  if (mode === 'replace') {
    document.querySelector('.vc-toggle-icon').style.left = '0';
    hideDecks();
    if (document.querySelector('.vc-open')) {
      $viewer.appendChild(h(`div#shabad${ShabadID}.deck.active.vc-open`, cards));
    } else {
      $viewer.appendChild(h(`div#shabad${ShabadID}.deck.active`, cards));
    }
    // Wait a tiny bit for rendering to finish before scrolling to the slide
    setTimeout(() => smoothScroll(`#slide${curSlide}`), 100);
    currentShabad = parseInt(ShabadID, 10) || ShabadID;
    decks[ShabadID] = shabad;
    castShabadLine(curSlide);
  } else if (mode === 'append') {
    cards.forEach(card => {
      $existingDeck.appendChild(card);
    });
    Object.assign(decks[ShabadID], shabad);
  }
};

const showAng = (PageNo, SourceID, LineID, rows) => {
  const { cards, lines } = createCards(rows, LineID);
  apvCur.PageNo = PageNo;
  apvCur.SourceID = SourceID;
  apvPages[PageNo] = lines;
  cards.forEach(card => $apv.appendChild(card));
  hideDecks();
  $apv.classList.add('active');
  if (isWebView && infiniteScroll) {
    $apvObserving = document.querySelector(`#apv #slide${lines[lines.length - 3]}`);
    $apvObserver.observe($apvObserving);
  }
  if (LineID) {
    setTimeout(() => smoothScroll(`#apv #slide${LineID}`), 100);
  }
};

const smoothScroll = (pos = 0) => {
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
};

const showLine = (ShabadID, LineID, rows, mode) => {
  const newShabadID = parseInt(ShabadID, 10) || ShabadID;
  if (apv && infiniteScroll) {
    createAPVContainer();
    if (!apvCur.ShabadID || apvCur.ShabadID !== ShabadID) {
      const info = rows[0];
      showAng(info.PageNo, info.Source.SourceID, LineID, rows);
      apvCur.ShabadID = ShabadID;
    } else {
      smoothScroll(`#apv #slide${LineID}`);
    }
  } else {
    const $existingDeck =
      document.querySelector(`div#shabad${ShabadID}.deck.active`) ||
      document.querySelector(`div#shabad${ShabadID}.deck`);
    const { cards, shabad } = createCards(rows, LineID);
    switch (mode) {
      case 'replace':
        if (newShabadID in decks) {
          const $shabadDeck = document.getElementById(`shabad${newShabadID}`);
          if (currentShabad !== newShabadID || !$shabadDeck.classList.contains('active')) {
            hideDecks();
            $shabadDeck.classList.add('active');
            currentShabad = newShabadID;
          }
          activateSlide($shabadDeck, LineID);
        } else {
          createDeck(cards, LineID, shabad, newShabadID, mode);
        }
        break;
      case 'append':
        cards.forEach(card => {
          $existingDeck.appendChild(card);
        });
        Object.assign(decks[ShabadID], shabad);
        break;
      case 'click':
        /* if you click on verse when message is open (announcement, blank, waheguru) 
        it should hide the message deck and show the shabad deck */
        if ($message.classList.contains('active')) {
          $message.classList.remove('active');
          $existingDeck.classList.add('active');
        }
        activateSlide($existingDeck, LineID);
        break;
      default:
        break;
    }
  }
};

const showText = (text, isGurmukhi = false) => {
  hideDecks();

  $message.classList.add('active');
  while ($message.firstChild) {
    $message.removeChild($message.firstChild);
  }

  const $textIs = document.createElement('div');
  $textIs.classList.add('gurbani');
  if (isGurmukhi) {
    $textIs.classList.add('gurmukhi');
  }
  $textIs.innerHTML = text;

  $message.appendChild(h('div.slide.active#announcement-slide', $textIs));
  castText(text, isGurmukhi);
};

const toggleSideMenu = () => {
  Array.from(document.querySelectorAll('.vc-toggle-icon i')).forEach(el => {
    el.classList.toggle('vc-icon-hidden');
  });
  Array.from(document.querySelectorAll('.deck')).forEach(el => {
    el.classList.toggle('vc-open');
  });
  document.querySelector('.viewer-controls').classList.toggle('viewer-controls-open');
};

document.querySelector('.vc-toggle-icon').onclick = toggleSideMenu;
