import { remote } from 'electron';

const moment = require('moment');

const { i18n } = remote.require('./app');
const request = require('request');
const { API_ENDPOINT } = require('../../api-config');
const tingle = require('../../../assets/js/vendor/tingle');

const modal = new tingle.Modal({
  footer: true,
  stickyFooter: false,
  cssClass: ['notifications-modal'],
  closeMethods: ['overlay', 'button', 'escape'],
});

const formatDate = (dateString, format = 'LL') => moment(dateString).format(format);
const scriptTagCheckRegEx = /<[^>]*script/i;

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

const parseContent = contentString => {
  if (scriptTagCheckRegEx.test(contentString)) {
    return stripScripts(contentString); // this might be overkill.
  }
  return contentString;
};

export const getNotifications = (timeStamp, callback) => {
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

export const showNotificationsModal = message => {
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
