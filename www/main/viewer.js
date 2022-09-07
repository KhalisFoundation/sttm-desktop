/* eslint
  global-require: 0,
  import/no-unresolved: 0,
  no-inner-declarations: 0,
  no-use-before-define: 0,
  no-undef: 0
*/

import { savedSettings } from './js/common/store/user-settings/get-saved-user-settings';
import { convertToLegacySettingsObj } from './js/common/utils';

global.platform = require('./js/desktop_scripts');
const h = require('hyperscript');
const scroll = require('scroll');
const { store, i18n } = require('electron').remote.require('./app');

const shortcuts = require('./js/keyboard-shortcuts/shortcuts');

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

shortcuts.applyShortcuts('viewer');

(() => {
  const viewerTitle = i18n.t('VIEWER_TITLE', { appName: i18n.t('APPNAME') });
  document.body.title = viewerTitle;
  document.querySelector('span.title').innerHTML = viewerTitle;
  document.querySelector('.vc-label').innerHTML = i18n.t('QUICK_TOOLS.SELF');

  if (store.getUserPref('app.layout.presenter-view')) {
    document.querySelector('body').classList.add('presenter-view');
  }

  /* Hide quick tools when app is loaded */
  const $vcToggleIcon = document.querySelector('.vc-toggle-icon');
  $vcToggleIcon.style.left = '-28vw';
})();

const hideDecks = () => {
  Array.from(document.querySelectorAll('.deck')).forEach(el => {
    el.classList.remove('active');
  });
};

const castToReceiver = () => {
  const latestSettings = JSON.parse(localStorage.getItem('userSettings'));
  castCur.prefs = convertToLegacySettingsObj(latestSettings);
  castCur.prefs.app = { theme: store.get('userPrefs.app.theme') };
  sendMessage(JSON.stringify(castCur));
};

const castText = (text, isGurmukhi) => {
  castCur = {};
  castCur.showInEnglish = isGurmukhi !== true;
  castCur.gurmukhi = text;
  castCur.larivaar = text;
  castCur.isText = true;
  castToReceiver();

  const activeSlide = document.querySelector('.deck.active .slide.active');
  if (activeSlide) {
    Array.prototype.forEach.call(activeSlide.children, element => {
      const icons = iconsetHtml(`icons-${element.classList[0]}`, element.innerHTML);
      if (icons) document.querySelector('.viewer-controls').appendChild(icons);
    });
  }
};

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
  const { shabadId, lineID, rows, mode } = JSON.parse(data);
  showLine(shabadId, lineID, rows, mode);
});

global.platform.ipc.on('show-text', (event, data) => {
  document.querySelector('.viewer-controls').innerHTML = '';
  const { text, isGurmukhi } = JSON.parse(data);
  showText(text, isGurmukhi);
});

global.platform.ipc.on('send-scroll', (event, pos) => {
  $scroll.scrollTo(
    0,
    (document.documentElement.scrollHeight - document.documentElement.offsetHeight) *
      JSON.parse(pos),
  );
});

global.platform.ipc.on('update-settings', () => {
  prefs = store.get('userPrefs');
  applyThemebg();
  castToReceiver();
});

global.platform.ipc.on('save-settings', (event, setting) => {
  const { key, payload, oldValue } = JSON.parse(setting);
  // checking typeof savedSettings[key] so that classs should not apply while custom background
  if (typeof savedSettings[key] !== 'object') {
    document.body.classList.remove(`${key}-${oldValue}`);
    document.body.classList.add(`${key}-${payload}`);
    savedSettings[key] = payload;
    localStorage.setItem('userSettings', JSON.stringify(savedSettings));
  }
});

global.platform.ipc.on('navigator-toggled', () => {
  document.body.classList.toggle('navigator-minimized');
});

global.platform.ipc.on('presenter-view', (event, inPresenterView) => {
  document.body.classList.toggle('presenter-view', inPresenterView);
});

const nextAng = () => {
  const next = apvCur.PageNo + 1;
  $apvObserver.unobserve($apvObserving);
  // showAng(next, apvCur.SourceID);
  global.platform.ipc.send('next-ang', JSON.stringify({ PageNo: next, SourceID: apvCur.SourceID }));
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
  const key = iconType === 'gurbani' ? 'bani' : iconType;
  const tagline = i18n.t(`QUICK_TOOLS.${key.toUpperCase()}`);
  if (content) {
    icons = h(`span.${classname}.iconset`, [
      h('p.tagline', tagline),
      h(
        'span.visibility',
        {
          onclick: () => {
            const settingChanger = { iconType, func: 'visibility' };
            global.platform.ipc.send('set-user-setting', JSON.stringify(settingChanger));
          },
        },
        h('i.fa.fa-eye-slash'),
      ),
      h(
        'span.minus.size',
        {
          onclick: () => {
            const settingChanger = { iconType, func: 'size', operation: 'minus' };
            global.platform.ipc.send('set-user-setting', JSON.stringify(settingChanger));
          },
        },
        h('i.fa.fa-minus-circle'),
      ),
      h(
        'span.plus.size',
        {
          onclick: () => {
            const settingChanger = { iconType, func: 'size', operation: 'plus' };
            global.platform.ipc.send('set-user-setting', JSON.stringify(settingChanger));
          },
        },
        h('i.fa.fa-plus-circle'),
      ),
    ]);
  }
  return icons;
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
  const $vcToggleIcon = document.querySelector('.vc-toggle-icon');
  $vcToggleIcon.style.left = '0vw';
  const newShabadID = parseInt(ShabadID, 10) || ShabadID;
  if (apv && infiniteScroll) {
    createAPVContainer();
    if (!apvCur.ShabadID || apvCur.ShabadID !== ShabadID) {
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
  $textIs.classList.add('announcements');
  if (isGurmukhi) {
    $textIs.classList.add('gurmukhi');
  }
  $textIs.innerHTML = text;

  /* If slide is not empty, show quick tools */
  const $vcToggleIcon = document.querySelector('.vc-toggle-icon');
  $vcToggleIcon.style.left = text ? '0vw' : '-28vw';

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
