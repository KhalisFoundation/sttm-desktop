const sanitizeHtml = require('sanitize-html');
const electron = require('electron');

const analytics = electron.remote.getGlobal('analytics');
const tingle = require('./vendor/tingle');
const strings = require('./strings');

// allowed html tags inside announcement
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

/**
 * boolean to check what modal page is asctive
 * false = dhan guru slide page
 * true = announcement page
 * default to false b/c dhan guru slide page is default
 */
let isAnnouncementTab = false;
const modal = new tingle.Modal({
  footer: true,
  stickyFooter: false,
  closeMethods: ['overlay', 'button', 'escape'],
  onClose() {},
  beforeClose() {
    return true; // close the modal
  },
});

// slide modal  body

// title
const slideHeader = '<h1 class = "modalTitle"> <center> Insert Slide </center></h1>';
// section title
const slideText = '<h2 class ="dhanguru">Dhan Guru:</h2>';
// button group
const buttons = '<center><div class="btn-group" id = "btn-group">'.concat(
  '<button class= "guru" id = "guru1">Nanak Dev Ji</button>',
  '<button class= "guru" id = "guru2">Angad Dev Ji</button>',
  '<button class= "guru" id = "guru3">Amar Das Ji</button>',
  '<button class= "guru" id = "guru4">Ram Das Ji</button>',
  '<button class= "guru" id = "guru5">Arjan Dev Ji</button>',
  '<button class= "guru" id = "guru6">Hargobind Sahib Ji</button>',
  '<button class= "guru" id = "guru7">Har Rai Sahib Ji</button>',
  '<button class= "guru" id = "guru8">Har Krishan Sahib Ji</button>',
  '<button class= "guru" id = "guru9">Teg Bahadur Sahib Ji</button>',
  '<button class= "guru" id = "guru10">Gobind Singh Ji</button>',
  '<button class= "guru" id = "guru11">Granth Sahib Ji</button>',
  '</div>',
  '</center>',
);
// announcement modal body
// announcement tab title
const announcementHeader =
  '<center><h1 class="announcementHeader">Insert Announcement</h1></center>';
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
  '</table>',
  '</div>',
);
const modalAnBox =
  '<div class="box-container"><div class="modal-ann-box" contenteditable="true" data-placeholder="Add announcement text here ..."></div></div>';
/**
 * sets each dhan guru button an onclick that will send that guru's name to the slide
 */
function buttonOnClick() {
  if (!isAnnouncementTab) {
    for (let i = 1; i <= 11; i += 1) {
      document.getElementById(`guru${i}`).onclick = () => {
        global.controller.sendText(strings.slideStrings.dhanguruStrings[i - 1], true);
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
    // is the slider checkd?
    const isGurmukhi = slider.checked;
    const placeholderText = isGurmukhi ? 'GoSxw ie`Qy ilKo ...' : 'Add announcement text here ..';

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
// sets the first tab, with header, section title, and button group
const slidePage = slideHeader + slideText + buttons;
// sets the second page with header, change language button, and content box
const announcementPage = announcementHeader + langSlider + modalAnBox;
// sets the default page to Dhan Guru slide page
modal.setContent(slidePage);

// sets the first button (OK) which on click sends the announcement to the screen
modal.addFooterBtn('Ok', 'tingle-btn tingle-btn--pull-right tingle-btn--default', () => {
  if (isAnnouncementTab) {
    analytics.trackEvent('display', 'announcement-slide');
    const isGurmukhi = document.querySelector('#modal-ann-lang').checked;
    const announcementText = sanitizeHtml(document.querySelector('.modal-ann-box').innerHTML, {
      allowedTags,
    });
    global.controller.sendText(announcementText, isGurmukhi);
    document.querySelector('.modal-ann-box').innerHTML = '';
    modal.close();
  } else {
    modal.close();
  }
});

// close button
modal.addFooterBtn('Close', 'tingle-btn tingle-btn--pull-right tingle-btn--danger', () => {
  modal.close();
});

// changes the tab to Dhan Guru Slides tab
modal.addFooterBtn('Slides', 'tingle-btn tingle-btn-pull-left tingle-btn--default', () => {
  // sets up the modal content (buttons, etc)
  modal.setContent(slidePage);
  // adds functionality to the buttons
  isAnnouncementTab = false;
  buttonOnClick();
});

// change tab to announcements
modal.addFooterBtn('Announcement', 'tingle-btn tingle-btn-pull-left tingle-btn--default', () => {
  // sets up modal content (box, etc)
  modal.setContent(announcementPage);
  isAnnouncementTab = true;
  setLangSliderVal();
  boxInputFunctionality();
});

// open modal
function openModal() {
  modal.open();
}

/* export openModal and buttonOnClick(because the Dhan Guru slides page is default tab
   isAnnouncementTab is also exported because it will be false on Dhan Guru slides page
*/
module.exports = {
  isAnnouncementTab,
  openModal,
  buttonOnClick,
};
