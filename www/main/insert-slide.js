const sanitizeHtml = require('sanitize-html');
const electron = require('electron');

const { i18n } = electron.remote.require('./app');
const analytics = electron.remote.getGlobal('analytics');
const tingle = require('../assets/js/vendor/tingle');
const strings = require('./strings');

// allowed html tags inside announcement
const allowedTags = strings.allowedAnnouncementTags;

/**
 * boolean to check what modal page is asctive
 * false = dhan guru slide page
 * true = announcement page
 * default to false b/c dhan guru slide page is default
 */
let isAnnouncementTab = false;

// slide modal  body

// title
const slideHeader = `<h1 class = "modalTitle">${i18n.t('INSERT.INSERT_DHAN_SLIDE')}</h1>`;
// section title
// button group
const buttons = `<div class="btn-group" id = "btn-group">
  <button class= "guru" id = "guru1">${i18n.t('INSERT.DHAN_GURU.NANAK_DEV_JI')}</button>
  <button class= "guru" id = "guru2">${i18n.t('INSERT.DHAN_GURU.ANGAD_DEV_JI')}</button>
  <button class= "guru" id = "guru3">${i18n.t('INSERT.DHAN_GURU.AMARDAS_SAHIB_JI')}</button>
  <button class= "guru" id = "guru4">${i18n.t('INSERT.DHAN_GURU.RAMDAS_SAHIB_JI')}</button>
  <button class= "guru" id = "guru5">${i18n.t('INSERT.DHAN_GURU.ARJUN_DEV_JI')}</button>
  <button class= "guru" id = "guru6">${i18n.t('INSERT.DHAN_GURU.HARGOBIND_SAHIB_JI')}</button>
  <button class= "guru" id = "guru7">${i18n.t('INSERT.DHAN_GURU.HARRAI_SAHIB_JI')}</button>
  <button class= "guru" id = "guru8">${i18n.t('INSERT.DHAN_GURU.HARKRISHAN_SAHIB_JI')}</button>
  <button class= "guru" id = "guru9">${i18n.t('INSERT.DHAN_GURU.TEG_BAHADUR_SAHIB_JI')}</button>
  <button class= "guru" id = "guru10">${i18n.t('INSERT.DHAN_GURU.GOBIND_SINGH_SAHIB_JI')}</button>
  <button class= "guru" id = "guru11">${i18n.t('INSERT.DHAN_GURU.GRANTH_SAHIB_JI')}</button>
  </div>`;

// announcement modal body
// announcement tab title
const announcementHeader = `<h1 class="modalTitle">${i18n.t('INSERT.INSERT_ANNOUNCEMENT')}</h1>`;
const langSlider = '<div class="lang-switch">'.concat(
  '<table width="120%">',
  '<tr>',
  '<td>',
  `<span class="lang-text">${i18n.t('INSERT.ANNOUNCEMENT_IN_GURMUKHI')}?</span>`,
  '</td>',
  '<td>',
  '<div class="switch">',
  '<input id="modal-ann-lang" name="modal-ann-lang" type="checkbox" value="gurmukhi">',
  '<label for="modal-ann-lang"></label>',
  '</div>',
  '</td>',
  '</tr>',
  '</table>',
  '</div>',
);
const modalAnBox = `<div class="box-container"><div class="modal-ann-box" contenteditable="true" data-placeholder="${i18n.t(
  'INSERT.ADD_ANNOUNCEMENT_TEXT',
)}"></div></div>`;

// sets the first tab, with header, section title, and button group
const slidePage = slideHeader + buttons;
// sets the second page with header, change language button, and content box
const announcementPage = announcementHeader + langSlider + modalAnBox;

// create modal
const modal = new tingle.Modal({
  footer: true,
  stickyFooter: false,
  closeMethods: ['overlay', 'button', 'escape'],
  onClose() {
    modal.modal.classList.remove('tingle-modal--visible');
  },
  beforeClose() {
    modal.setContent(slidePage);
    return true; // close the modal
  },
});
// sets the default page to Dhan Guru slide page
modal.setContent(slidePage);
/**
 * sets each dhan guru button an onclick that will send that guru's name to the slide
 */
function buttonOnClick() {
  if (!isAnnouncementTab) {
    for (let i = 1; i <= 11; i += 1) {
      document.getElementById(`guru${i}`).onclick = () => {
        global.controller.sendText(strings.slideStrings.dhanguruStrings[i - 1], true, false);
        global.core.updateInsertedSlide(true);
        modal.close();
      };
    }
  }
}
/**
 * sets the onclick val for the slider
 * appends class gurmukhi to the text box (changes font family to gurbaniakhar in css file)
 * changes placeholder text
 */
function setLangSliderVal() {
  const slider = document.querySelector('#modal-ann-lang');
  slider.onclick = () => {
    // is the slider checked?
    const isGurmukhi = slider.checked;
    const placeholderText = isGurmukhi
      ? strings.announcemenetPlaceholder.gurmukhi
      : i18n.t(`INSERT.${strings.announcemenetPlaceholder.english}`);

    const $announcementBox = document.querySelector('.modal-ann-box');
    $announcementBox.classList.toggle('gurmukhi', isGurmukhi);
    $announcementBox.setAttribute('data-placeholder', placeholderText);
  };
}

/**
 * sanitize the html, allow only the permitted tage from allowedTags array above
 */
function boxInputFunctionality() {
  const box = document.querySelector('.modal-ann-box');
  box.oninput = () => {
    const $announcementInput = document.querySelector('.announcement-text');
    $announcementInput.innerHTML.replace(
      /.*/g,
      sanitizeHtml($announcementInput.innerHTML, { allowedTags }),
    );
  };
}

// sets the first button (OK) which on click sends the announcement to the screen
modal.addFooterBtn(i18n.t('OK'), 'tingle-btn tingle-btn--pull-right tingle-btn--default', () => {
  if (isAnnouncementTab) {
    analytics.trackEvent('display', 'announcement-slide');
    const isGurmukhi = document.querySelector('#modal-ann-lang').checked;
    const announcementText = sanitizeHtml(document.querySelector('.modal-ann-box').innerHTML, {
      allowedTags,
    });
    global.controller.sendText(announcementText, isGurmukhi, true);
    global.core.updateInsertedSlide(true);
    document.querySelector('.modal-ann-box').innerHTML = '';
  }
  modal.close();
});

// close button
modal.addFooterBtn(
  i18n.t('INSERT.CLOSE'),
  'tingle-btn tingle-btn--pull-right tingle-btn--danger',
  () => {
    modal.close();
  },
);

// change tab to announcements
// changes to back when the tab is open
// onclick is blank because it will change depending on what is being displayed
modal.addFooterBtn(
  i18n.t('INSERT.ANNOUNCEMENT'),
  'tingle-btn tingle-btn-pull-left tingle-btn--default modal-tab-btn',
  () => {},
);
const modalTabBtn = document.querySelector('.modal-tab-btn');
modalTabBtn.addEventListener('click', () => {
  if (!isAnnouncementTab) {
    isAnnouncementTab = true;
    // sets up modal content (box, etc)
    modal.setContent(announcementPage);
    setLangSliderVal();
    boxInputFunctionality();
    modalTabBtn.textContent = i18n.t('INSERT.BACK');
  } else {
    modalTabBtn.textContent = i18n.t('INSERT.ANNOUNCEMENT');
    isAnnouncementTab = false;
    modal.setContent(slidePage);
    buttonOnClick();
  }
});
// open modal
function openModal() {
  if (!modal.isOpen()) {
    isAnnouncementTab = false;
    modalTabBtn.textContent = i18n.t('INSERT.ANNOUNCEMENT');
    modal.open();
  }
}

/* export openModal and buttonOnClick(because the Dhan Guru slides page is default tab
   isAnnouncementTab is also exported because it will be false on Dhan Guru slides page
*/
module.exports = {
  isAnnouncementTab,
  openModal,
  buttonOnClick,
};
