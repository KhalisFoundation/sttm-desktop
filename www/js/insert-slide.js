const sanitizeHtml = require('sanitize-html');
const electron = require('electron');

const analytics = electron.remote.getGlobal('analytics');
const tingle = require('./vendor/tingle');
const strings = require('./strings');
const settings = require('./settings');

const { store } = electron.remote.require('./app');

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
const slideHeader = '<h1 class = "modalTitle">Insert Dhan Slide </h1>';
// section title
// button group
const buttons = '<div class="btn-group" id = "btn-group">'.concat(
  '<button class= "guru" id = "guru1">Guru Nanak Dev Ji</button>',
  '<button class= "guru" id = "guru2">Guru Angad Dev Ji</button>',
  '<button class= "guru" id = "guru3">Guru Amar Das Ji</button>',
  '<button class= "guru" id = "guru4">Guru Ram Das Ji</button>',
  '<button class= "guru" id = "guru5">Guru Arjan Dev Ji</button>',
  '<button class= "guru" id = "guru6">Guru Hargobind Sahib Ji</button>',
  '<button class= "guru" id = "guru7">Guru Har Rai Sahib Ji</button>',
  '<button class= "guru" id = "guru8">Guru Har Krishan Sahib Ji</button>',
  '<button class= "guru" id = "guru9">Guru Teg Bahadur Sahib Ji</button>',
  '<button class= "guru" id = "guru10">Guru Gobind Singh Ji</button>',
  '<button class= "guru" id = "guru11">Guru Granth Sahib Ji</button>',
  '</div>',
);
// announcement modal body
// announcement tab title
const announcementHeader = '<h1 class="modalTitle">Insert Announcement</h1>';
const langSlider = '<div class="lang-switch">'.concat(
  '<table width="120%">',
  '<tr>',
  '<td>',
  '<span class="lang-text">Announcement in Gurmukhi?</span>',
  '</td>',
  '<td>',
  '<div class="switch">',
  '<input id="modal-ann-lang" name="modal-ann-lang" type="checkbox" value="gurmukhi">',
  '<label for="modal-ann-lang"></label>',
  '</div>',
  '</td>',
  '</tr>',
  '<tr>',
  '<td>',
  '<span class="lang-text">Show Announcement in Overlay</span>',
  '</td>',
  '<td>',
  '<div class="switch">',
  `<input id="modal-ann-overlay" name="modal-ann-overlay" type="checkbox" value="gurmukhi">`,
  '<label for="modal-ann-overlay"></label>',
  '</div>',
  '</td>',
  '</tr>',
  '</table>',
  '</div>',
);
const modalAnBox =
  '<div class="box-container"><div class="modal-ann-box" contenteditable="true" data-placeholder="Add announcement text here ..."></div></div>';

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
      : strings.announcemenetPlaceholder.english;

    const $announcementBox = document.querySelector('.modal-ann-box');
    $announcementBox.classList.toggle('gurmukhi', isGurmukhi);
    $announcementBox.setAttribute('data-placeholder', placeholderText);
  };
}

/**
 * sets the onclick val for the slider
 * changes announcement overlay slider
 */
function setOverlaySliderVal() {
  let announcementOverlay = store.getUserPref('app.announcement-overlay');
  const slider = document.querySelector('#modal-ann-overlay');
  slider.checked = announcementOverlay;
  slider.onclick = () => {
    // is the slider checked?
    announcementOverlay = !announcementOverlay;
    document.querySelector('input#announcement-overlay').checked = announcementOverlay;
    store.setUserPref('app.announcement-overlay', announcementOverlay);
    settings.init();
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
modal.addFooterBtn('Ok', 'tingle-btn tingle-btn--pull-right tingle-btn--default', () => {
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
modal.addFooterBtn('Close', 'tingle-btn tingle-btn--pull-right tingle-btn--danger', () => {
  modal.close();
});

// change tab to announcements
// changes to back when the tab is open
// onclick is blank because it will change depending on what is being displayed
modal.addFooterBtn(
  'Announcement',
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
    setOverlaySliderVal();
    boxInputFunctionality();
    modalTabBtn.textContent = 'Back';
  } else {
    modalTabBtn.textContent = 'Announcement';
    isAnnouncementTab = false;
    modal.setContent(slidePage);
    buttonOnClick();
  }
});
// open modal
function openModal() {
  if (!modal.isOpen()) {
    isAnnouncementTab = false;
    modalTabBtn.textContent = 'Announcement';
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
