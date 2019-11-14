const h = require('hyperscript');
const getJSON = require('get-json');
const request = require('request');
const moment = require('moment');
const electron = require('electron');
const sanitizeHtml = require('sanitize-html');
const strings = require('./strings.json');
const copy = require('copy-to-clipboard');
const isOnline = require('is-online');

const { randomShabad } = require('./banidb');
const settings = require('./settings');
const tingle = require('./vendor/tingle');
const search = require('./search');

const { store } = electron.remote.require('./app');
const analytics = electron.remote.getGlobal('analytics');

const allowedTags = [
  'b',
  'i',
  'em',
  'u',
  'pre',
  'strong',
  'div',
  'code',
  'br',
  'p',
  'ul',
  'li',
  'ol',
];

const modal = new tingle.Modal({
  footer: true,
  stickyFooter: false,
  cssClass: ['notifications-modal'],
  closeMethods: ['overlay', 'button', 'escape'],
});

const API_ENDPOINT = 'http://api.sikhitothemax.org'; // TODO: move this to config file

const closeBtn = 'Close';
modal.addFooterBtn(closeBtn, 'tingle-btn tingle-btn--pull-right tingle-btn--default', () => {
  modal.close();
});

const buttonFactory = ({
  buttonId = '',
  buttonIcon = 'fa-times',
  buttonType = 'open',
  pageToToggle,
}) => {
  let classList;
  if (buttonType === 'open') {
    classList = `#${buttonId}.active`;
  } else {
    classList = '.close-button';
  }
  return h(
    `a${classList}.navigator-button`,
    {
      onclick: () => {
        module.exports.toggleMenu(pageToToggle);
      },
    },
    h(`i.fa.${buttonIcon}`),
  );
};

const goToShabadPage = shabadId => {
  global.core.search.loadShabad(shabadId);
  document.querySelector('#shabad-pageLink').click();
};

// format the date default to "Month Day, Year"
const formatDate = (dateString, format = 'LL') => moment(dateString).format(format);

const stripScripts = string => {
  const div = document.createElement('div');
  div.innerHTML = string;
  const scripts = div.getElementsByTagName('script');
  let i = scripts.length;
  while (i > 0) {
    scripts[i].parentNode.removeChild(scripts[i]);
    i -= 1;
  }
  return div.innerHTML;
};

const scriptTagCheckRegEx = /<[^>]*script/i;

const parseContent = contentString => {
  if (scriptTagCheckRegEx.test(contentString)) {
    return stripScripts(contentString); // this might be overkill.
  }
  return contentString;
};

const createNotificationContent = msgList => {
  let html = '<h1 class="model-title">What\'s New</h1> <div class="messages">';

  msgList.forEach(item => {
    html += '<div class="row">';
    html += `<div class="date">${formatDate(item.Created)}</div>`;
    html += `<div class="title">${item.Title}</div>`;
    html += `<div class="content">${parseContent(item.Content)}</div>`;
    html += '</div>';
  });
  html += '</div>';

  return html;
};

const showNotificationsModal = message => {
  if (message && message.rows && message.rows.length > 0) {
    const time = moment().format('YYYY-MM-DD HH:mm:ss');
    global.core.platformMethod('updateNotificationsTimestamp', time);
    const content = createNotificationContent(message.rows);
    // set content
    modal.setContent(content);
    // open modal
    modal.open();
  }
};

const getNotifications = (timeStamp, callback) => {
  request(
    `${API_ENDPOINT}/messages/desktop/${typeof timeStamp === 'string' ? timeStamp : ''}`,
    (error, response) => {
      let message;
      if (response) {
        try {
          message = JSON.parse(response.body);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(e);
        }
      }
      callback.apply(this, [message]);
    },
  );
};

const notificationsBellClickHandler = () => {
  analytics.trackEvent('display', 'notifications');
  getNotifications(null, showNotificationsModal);
};

/* Generate Toggle Buttons */
const menuButton = h('a.menu-button.navigator-button.active', h('i.fa.fa-bars'));
const closeButton = buttonFactory({
  buttonType: 'close',
  pageToToggle: '#menu-page',
});

/* load Shabad buttons */
const randomShabadButton = h(
  'li',
  h(
    'a.random-shabad-button',
    {
      onclick: () => {
        analytics.trackEvent('display', 'random-shabad');
        randomShabad().then(goToShabadPage);
      },
    },
    h('i.fa.fa-random.list-icon'),
    'Show Random Shabad',
  ),
);

const notificationButton = h(
  'li',
  h(
    'a.notification-button',
    {
      onclick: notificationsBellClickHandler,
    },
    h('i.fa.fa-bell.list-icon'),
    "What's New",
  ),
);
const hukamnamaButton = h(
  'li',
  h(
    'a.hukamnama-button',
    {
      onclick: () => {
        getJSON('https://api.banidb.com/hukamnama/today', (error, response) => {
          if (!error) {
            const hukamShabadID = parseInt(response.shabadinfo.id, 10);

            analytics.trackEvent('display', 'hukamnama', hukamShabadID);
            goToShabadPage(hukamShabadID);
          }
        });
      },
    },
    h('i.fa.fa-gavel.list-icon'),
    'Daily Hukamnama',
  ),
);

/* load text buttons */
const emptySlideButton = h(
  'li',
  h(
    'a.empty-slide-button',
    {
      onclick: () => {
        analytics.trackEvent('display', 'empty-slide');
        global.controller.sendText('');
      },
    },
    h('i.fa.fa-eye-slash.list-icon'),
    'Add Empty Slide',
  ),
);
const waheguruSlideButton = h(
  'li',
  h(
    'a.waheguru-slide-button',
    {
      onclick: () => {
        analytics.trackEvent('display', 'waheguru-slide');
        global.controller.sendText('vwihgurU', true);
      },
    },
    h('i.fa.fa-circle.list-icon'),
    'Add Waheguru Slide',
  ),
);
const dhanGuruSlideButton = h(
  'li',
  h(
    'a.dhanguru-slide-button',
    {
      onclick: () => {
        const guruJi = document.querySelector('#dhan-guru').value;
        analytics.trackEvent('display', 'dhanguru-slide', guruJi);
        global.controller.sendTextWithTranslations(guruJi);
        console.log(Object.keys(guruJi));
      },
    },
    h('i.fa.fa-circle-o.list-icon'),
    [
      h('label', { htmlFor: 'dhan-guru' }, 'Add Dhan Guru '),
      h('select#dhan-guru', { value: ' ' }, [
        h('option', { value: ' ' }, 'Select'),
        h('option', { value: strings.dhanSlides[0] }, 'Nanak Dev Ji'),
        h('option', { value: `${strings.dhanSlides[1]}` }, 'Angad Dev Ji'),
        h('option', { value: `${strings.dhanSlides[2]}` }, 'Amardas Sahib Ji'),
        h('option', { value: `${strings.dhanSlides[3]}` }, 'Ramdas Sahib Ji'),
        h('option', { value: `${strings.dhanSlides[4]}` }, 'Arjun Dev Ji'),
        h('option', { value: `${strings.dhanSlides[5]}` }, 'Har Gobind Sahib Ji'),
        h('option', { value: `${strings.dhanSlides[6]}` }, 'Har Rai Sahib Ji'),
        h('option', { value: `${strings.dhanSlides[7]}` }, 'Har Krishan Sahib Ji'),
        h('option', { value: `${strings.dhanSlides[8]}` }, 'Teg Bahadur Sahib Ji'),
        h('option', { value: `${strings.dhanSlides[9]}` }, 'Gobind Singh Sahib Ji'),
        h('option', { value: `${strings.dhanSlides[10]}` }, 'Granth Sahib Ji'),
      ]),
    ],
  ),
);
const announcementSlideButton = h(
  'li.announcement-box',
  h('header', h('i.fa.fa-bullhorn.list-icon'), 'Add announcement slide'),
  h('li', [
    h('span', 'Show Announcement in Bani Overlay'),
    h('div.switch', [
      h('input#announcement-overlay', {
        name: 'announcement-overlay',
        type: 'checkbox',
        checked: store.getUserPref('app.announcement-overlay'),
        onclick: () => {
          const announcementOverlay = !store.getUserPref('app.announcement-overlay');
          store.setUserPref('app.announcement-overlay', announcementOverlay);
          settings.init();
          document.querySelector('button.announcement-slide-btn.button').click();
        },
        value: 'overlay',
      }),
      h('label', {
        htmlFor: 'announcement-overlay',
      }),
    ]),
  ]),
  h('li', [
    h('span', 'Announcement in Gurmukhi'),
    h('div.switch', [
      h('input#announcement-language', {
        name: 'announcement-language',
        type: 'checkbox',
        onclick: () => {
          const isGurmukhi = document.querySelector('#announcement-language').checked;
          const placeholderText = isGurmukhi
            ? strings.announcement.placeholder.gurmukhi
            : strings.announcement.placeholder.english;

          const $announcementText = document.querySelector('.announcement-text');
          $announcementText.classList.toggle('gurmukhi', isGurmukhi);
          $announcementText.setAttribute('data-placeholder', placeholderText);
        },
        value: 'gurmukhi',
      }),
      h('label', {
        htmlFor: 'announcement-language',
      }),
    ]),
  ]),
  h('div.announcement-text', {
    contentEditable: true,
    'data-placeholder': 'Add announcement text here ...',
    oninput: () => {
      const $announcementInput = document.querySelector('.announcement-text');
      $announcementInput.innerHTML.replace(
        /.*/g,
        sanitizeHtml($announcementInput.innerHTML, { allowedTags }),
      );
    },
  }),
  h(
    'button.announcement-slide-btn.button',
    {
      onclick: () => {
        analytics.trackEvent('display', 'announcement-slide');
        const isGurmukhi = document.querySelector('#announcement-language').checked;
        const announcementText = sanitizeHtml(
          document.querySelector('.announcement-text').innerHTML,
          { allowedTags },
        );
        global.controller.sendText(announcementText, isGurmukhi, true);
        global.core.updateInsertedSlide(true);
      },
    },
    'Add Announcement',
  ),
);

// On href clicks, open the link in actual browser
document.body.addEventListener('click', e => {
  const { target } = e;
  const link = target.href;
  if (target.href) {
    e.preventDefault();
    electron.shell.openExternal(link);
  }
});

module.exports = {
  settings,

  init() {
    const $preferencesOpen = document.querySelectorAll('.preferences-open');
    $preferencesOpen.forEach($menuToggle => {
      $menuToggle.appendChild(menuButton.cloneNode(true));
      $menuToggle.addEventListener('click', module.exports.showSettingsTab);
    });
    document.querySelector('.preferences-close').appendChild(closeButton);

    const $listOfCustomSlides = document.querySelector('#list-of-custom-slides');
    $listOfCustomSlides.appendChild(emptySlideButton);
    $listOfCustomSlides.appendChild(waheguruSlideButton);
    $listOfCustomSlides.appendChild(dhanGuruSlideButton);
    $listOfCustomSlides.appendChild(announcementSlideButton);

    const $listOfShabadOptions = document.querySelector('#list-of-shabad-options');
    $listOfShabadOptions.appendChild(randomShabadButton);
    $listOfShabadOptions.appendChild(hukamnamaButton);
    $listOfShabadOptions.appendChild(notificationButton);

    // when the app is reloaded, enable the control for akhandpaatt
    store.set('userPrefs.slide-layout.display-options.disable-akhandpaatt', false);
    settings.init();
  },

  getNotifications,

  showNotificationsModal,

  showSettingsTab(fromMainMenu) {
    search.activateNavLink('settings', true);
    search.activateNavPage('session', { id: 'settings', label: 'Settings' });

    const isPresenterView = document.body.classList.contains('presenter-view');
    const settingsViewType = isPresenterView ? 'from_presenter_view' : 'not_from_presenter_view';
    const settingsClickSource = fromMainMenu ? 'menu_settings' : 'hamburger_settings';
    analytics.trackEvent(settingsClickSource, 'click', settingsViewType);

    const sessionPage = document.querySelector('#session-page');
    sessionPage.classList.add('bounce-animate');
    sessionPage.addEventListener('webkitAnimationEnd', () => {
      sessionPage.classList.remove('bounce-animate');
    });
  },

  toggleMenu(pageSelector = '#menu-page') {
    document.querySelector(pageSelector).classList.toggle('active');
  },
};
