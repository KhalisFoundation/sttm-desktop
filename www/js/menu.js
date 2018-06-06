const h = require('hyperscript');
const settings = require('./settings');
const getJSON = require('get-json');
const tingle = require('./vendor/tingle');
const request = require('request');
const moment = require('moment');
const electron = require('electron');

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
      } },
    h(`i.fa.${buttonIcon}`));
};

const goToShabadPage = (shabadId) => {
  global.core.search.loadShabad(shabadId);
  module.exports.toggleMenu('#shabad-menu-page');
  document.querySelector('#shabad-pageLink').click();
};

// format the date default to "Month Day, Year"
const formatDate = (dateString, format = 'LL') => moment(dateString).format(format);

const stripScripts = (string) => {
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

const parseContent = (contentString) => {
  if (scriptTagCheckRegEx.test(contentString)) {
    return stripScripts(contentString); // this might be overkill.
  }
  return contentString;
};


const createNotificationContent = (msgList) => {
  let html = '<h1 class="model-title">What\'s New</h1> <div class="messages">';

  msgList.forEach((item) => {
    html += '<div class="row">';
    html += `<div class="date">${formatDate(item.Created)}</div>`;
    html += `<div class="title">${item.Title}</div>`;
    html += `<div class="content">${parseContent(item.Content)}</div>`;
    html += '</div>';
  });
  html += '</div>';

  return html;
};

const showNotificationsModal = (message) => {
  if (message && message.length > 0) {
    const time = moment().format('YYYY-MM-DD HH:mm:ss');
    global.core.platformMethod('updateNotificationsTimestamp', time);
    const content = createNotificationContent(message);
    // set content
    modal.setContent(content);
    // open modal
    modal.open();
    document.getElementById('notifications-icon').classList.remove('badge');
  }
};

const getNotifications = (timeStamp, callback) => {
  request(`${API_ENDPOINT}/messages/desktop/${(typeof timeStamp === 'string') ? timeStamp : ''}`, (error, response) => {
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
  });
};

const notificationsBellClickHandler = () => {
  getNotifications(null, showNotificationsModal);
};

/* Generate Toggle Buttons */
const menuButton = h(
  'a.menu-button.navigator-button.active',
  h('i.fa.fa-bars'));
const customSlidesButton = buttonFactory({
  buttonType: 'open',
  buttonIcon: 'fa-clone',
  buttonId: 'custom-slides-menu',
  pageToToggle: '#custom-slides-page',
});
const shabadMenuButton = buttonFactory({
  buttonType: 'open',
  buttonIcon: 'fa-archive',
  buttonId: 'shabad-menu',
  pageToToggle: '#shabad-menu-page',
});
const closeButton = buttonFactory({
  buttonType: 'close',
  pageToToggle: '#menu-page',
});
const shabadMenuCloseButton = buttonFactory({
  buttonType: 'close',
  pageToToggle: '#shabad-menu-page',
});
const customSlidesCloseButton = buttonFactory({
  buttonType: 'close',
  pageToToggle: '#custom-slides-page',
});

/* load Shabad buttons */
const randomShabadButton = h(
  'li',
  h(
    'a.random-shabad-button',
    {
      onclick: () => {
        global.platform.search.randomShabad()
          .then(goToShabadPage);
      } },
    h('i.fa.fa-random.list-icon'),
    'Show Random Shabad'));
const anandKarajButton = h(
  'li',
  h(
    'a.anand-karaj-button',
    {
      onclick: () => { goToShabadPage(2897); },
    },
    h('i.fa.fa-heart.list-icon'),
    'Anand Karaj / Sikh Marriage'));
const hukamnamaButton = h(
  'li',
  h(
    'a.hukamnama-button',
    {
      onclick: () => {
        getJSON('https://api.banidb.com/hukamnama/today', (error, response) => {
          goToShabadPage(response.shabadinfo.id);
        });
      } },
    h('i.fa.fa-gavel.list-icon'),
    'Daily Hukamnama'));

/* load text buttons */
const emptySlideButton = h(
  'li',
  h(
    'a.empty-slide-button',
    {
      onclick: () => {
        global.controller.sendText('');
      } },
    h('i.fa.fa-eye-slash.list-icon'),
    'Add Empty Slide'));
const waheguruSlideButton = h(
  'li',
  h(
    'a.waheguru-slide-button',
    {
      onclick: () => {
        global.controller.sendText('vwihgurU', true);
      } },
    h('i.fa.fa-circle.list-icon'),
    'Add Waheguru Slide'));
const dhanGuruSlideButton = h(
  'li',
  h(
    'a.dhanguru-slide-button',
    {
      onclick: () => {
        const guruJi = document.querySelector('#dhan-guru').value;
        global.controller.sendText(guruJi, true);
      } },
    h('i.fa.fa-circle-o.list-icon'),
    [
      h('label', { htmlFor: 'dhan-guru' }, 'Add Dhan Guru '),
      h(
        'select#dhan-guru',
        { value: ' ' },
        [
          h('option', { value: ' ' }, 'Select'),
          h('option', { value: 'DMn gurU nwnk dyv jI' }, 'Nanak Dev Ji'),
          h('option', { value: 'DMn gurU AMgd dyv jI' }, 'Angad Dev Ji'),
          h('option', { value: 'DMn gurU Amrdwsu swihb jI' }, 'Amardas Sahib Ji'),
          h('option', { value: 'DMn gurU rwmdws swihb jI' }, 'Ramdas Sahib Ji'),
          h('option', { value: 'DMn gurU Arjun dyv jI' }, 'Arjun Dev Ji'),
          h('option', { value: 'DMn gurU hir goibMd swihb jI' }, 'Har Gobind Sahib Ji'),
          h('option', { value: 'DMn gurU hir rwie swihb jI' }, 'Har Rai Sahib Ji'),
          h('option', { value: 'DMn gurU hir ikRSx swihb jI' }, 'Har Krishan Sahib Ji'),
          h('option', { value: 'DMn gurU qyg bhwdr swihb jI' }, 'Teg Bahadur Sahib Ji'),
          h('option', { value: 'DMn gurU goibMd isMG swihb jI' }, 'Gobind Singh Sahib Ji'),
          h('option', { value: 'DMn gurU gRMQ swihb jI' }, 'Granth Sahib Ji'),
        ])]));
const announcementSlideButton = h(
  'li.announcement-box',
  h(
    'header',
    h('i.fa.fa-bullhorn.list-icon'),
    'Add announcement slide'),
  h('li',
    [
      h('span', 'Announcement in gurmukhi'),
      h('div.switch',
        [
          h('input#announcement-language',
            {
              name: 'announcement-language',
              type: 'checkbox',
              onclick: () => {
                const $announcementText = document.querySelector('.announcement-text');
                $announcementText.classList.toggle('gurmukhi');
                const isGurmukhi = document.querySelector('#announcement-language').checked;
                $announcementText.value = '';
                $announcementText.placeholder = isGurmukhi ? 'GoSxw ie`Qy ilKo ...' : 'Add announcement text here ..';
              },
              value: 'gurmukhi' }),
          h('label',
            {
              htmlFor: 'announcement-language' })])]),
  h(
    'textarea.announcement-text',
    {
      placeholder: 'Add announcement text here ..',
    }),
  h(
    'button.announcement-slide-btn.button',
    {
      onclick: () => {
        const isGurmukhi = document.querySelector('#announcement-language').checked;
        const announcementText = document.querySelector('.announcement-text').value;
        global.controller.sendText(announcementText, isGurmukhi);
      } },
    'Add Announcement'));
const notificationButton = h(
  'button.notificaitons.navigator-button.navigator-header',
  {
    onclick: notificationsBellClickHandler,
  },
  h('i#notifications-icon.fa.fa-bell'),
);

// On href clicks, open the link in actual browser
document.body.addEventListener('click', (e) => {
  const target = e.target;
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
    $preferencesOpen.forEach(($menuToggle) => {
      $menuToggle.appendChild(menuButton.cloneNode(true));
      $menuToggle.addEventListener('click', () => { module.exports.toggleMenu('#menu-page'); });
    });
    document.querySelector('.preferences-close').appendChild(closeButton);

    document.getElementById('current-shabad-menu').appendChild(customSlidesButton);
    document.querySelector('.custom-slides-close').appendChild(customSlidesCloseButton);


    document.getElementById('shabad-menu').appendChild(shabadMenuButton);
    document.getElementById('notifications').appendChild(notificationButton);
    document.querySelector('.shabad-menu-close').appendChild(shabadMenuCloseButton);

    const $listOfCustomSlides = document.querySelector('#list-of-custom-slides');
    $listOfCustomSlides.appendChild(emptySlideButton);
    $listOfCustomSlides.appendChild(waheguruSlideButton);
    $listOfCustomSlides.appendChild(dhanGuruSlideButton);
    $listOfCustomSlides.appendChild(announcementSlideButton);

    const $listOfShabadOptions = document.querySelector('#list-of-shabad-options');
    $listOfShabadOptions.appendChild(randomShabadButton);
    $listOfShabadOptions.appendChild(hukamnamaButton);
    $listOfShabadOptions.appendChild(anandKarajButton);
    settings.init();
  },

  getNotifications,

  showNotificationsModal,

  toggleMenu(pageSelector = '#menu-page') {
    document.querySelector(pageSelector).classList.toggle('active');
  },
};
