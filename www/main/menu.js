import { savedSettings } from './common/store/user-settings/get-saved-user-settings';
import { applyUserSettings } from './common/store/user-settings/apply-user-settings';

const h = require('hyperscript');
const request = require('request');
const moment = require('moment');
const electron = require('electron');

// const isOnline = require('is-online');

const settings = require('./settings');
const tingle = require('../assets/js/vendor/tingle');
// const search = require('./search');

const { i18n } = electron.remote.require('./app');
const analytics = electron.remote.getGlobal('analytics');

const modal = new tingle.Modal({
  footer: true,
  stickyFooter: false,
  cssClass: ['notifications-modal'],
  closeMethods: ['overlay', 'button', 'escape'],
});

const { API_ENDPOINT } = require('./api-config');

const closeBtn = 'Close';
modal.addFooterBtn(closeBtn, 'tingle-btn tingle-btn--pull-right tingle-btn--default', () => {
  modal.close();
});

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

/* Generate Toggle Buttons */
const menuButton = h('a.menu-button.navigator-button.active', h('i.fa.fa-bars'));

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

    // isOnline().then(online => {
    //   document.querySelector('.hukamnama-button').classList.toggle('is-offline', !online);
    // });

    applyUserSettings(savedSettings);
  },

  getNotifications,

  showNotificationsModal,

  showSettingsTab(fromMainMenu) {
    // search.activateNavLink('settings', true);
    // search.activateNavPage('session', { id: 'settings', label: i18n.t('TOOLBAR.SETTINGS') });

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
