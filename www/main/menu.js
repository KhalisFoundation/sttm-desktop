const h = require('hyperscript');
const getJSON = require('get-json');
const request = require('request');
const moment = require('moment');
const electron = require('electron');
const sanitizeHtml = require('sanitize-html');
const strings = require('./strings');

const { randomShabad } = require('./banidb');
const settings = require('./settings');
const tingle = require('../assets/js/vendor/tingle');
const search = require('./search');

const { store, i18n } = electron.remote.require('./app');
const analytics = electron.remote.getGlobal('analytics');

const allowedTags = strings.allowedAnnouncementTags;

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
  let html = `<h1 class="model-title">${i18n.t('OTHERS.WHATS_NEW')}</h1> <div class="messages">`;

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
    i18n.t('OTHERS.SHOW_RANDOM_SHABAD'),
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
    i18n.t('OTHERS.WHATS_NEW'),
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
    i18n.t('OTHERS.DAILY_HUKAMNAMA'),
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
    i18n.t('INSERT.ADD_EMPTY_SLIDE'),
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
    i18n.t('INSERT.ADD_WAHEGURU_SLIDE'),
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
        global.controller.sendText(guruJi, true);
      },
    },
    h('i.fa.fa-circle-o.list-icon'),
    [
      h('label', { htmlFor: 'dhan-guru' }, i18n.t('INSERT.ADD_DHAN_GURU')),
      h('select#dhan-guru', { value: ' ' }, [
        h('option', { value: ' ' }, i18n.t('INSERT.SELECT')),
        strings.dropdownStrings.gurus.map((value, index) =>
          h(
            'option',
            { value: strings.slideStrings.dhanguruStrings[index] },
            i18n.t(`INSERT.DHAN_GURU.${value}`),
          ),
        ),
      ]),
    ],
  ),
);
const announcementSlideButton = h(
  'li.announcement-box',
  h('header', h('i.fa.fa-bullhorn.list-icon'), i18n.t('INSERT.ADD_ANNOUNCEMENT_SLIDE')),
  h('li', [
    h('span', i18n.t('INSERT.ANNOUNCEMENT_IN_GURMUKHI')),
    h('div.switch', [
      h('input#announcement-language', {
        name: 'announcement-language',
        type: 'checkbox',
        onclick: () => {
          const isGurmukhi = document.querySelector('#announcement-language').checked;
          const placeholderText = isGurmukhi
            ? strings.announcemenetPlaceholder.gurmukhi
            : i18n.t(`INSERT.${strings.announcemenetPlaceholder.english}`);

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
    'data-placeholder': i18n.t('INSERT.ADD_ANNOUNCEMENT_TEXT'),
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
    i18n.t('INSERT.ADD_ANNOUNCEMENT'),
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
    search.activateNavPage('session', { id: 'settings', label: i18n.t('TOOLBAR.SETTINGS') });

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
