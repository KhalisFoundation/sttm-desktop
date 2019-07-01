const tingle = require('./vendor/tingle');
const strings = require('./strings');

let isAnnouncementTab;
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
  '<table width="120%"><tr><td><span class="lang-text">Announcement in Gurmukhi?</span></td>',
  '<td class="switch" id = "modal-lang-slider" align="right"><input id="modal-lang-toggle" name="modal-lang-toggle" type="checkbox" value="gurmukhi"><label for="modal-lang-toggle"></label></td></tr></table>',
  '</div>',
);
const modalAnBox =
  '<div class="box-container"><div class="modal-ann-box" contenteditable="true" data-placeholder="Add announcement text here ..."></div></div>';
/**
 * sets each dhan guru button an onclick that will send that guru's name to the slide
 */
function buttonOnClick() {
  for (let i = 1; i <= 11; i += 1) {
    document.getElementById(`guru${i}`).onclick = () => {
      global.controller.sendText(strings.slideStrings.dhanguruStrings[i - 1], true);
      modal.close();
    };
  }
}
function setLangSliderVal() {
  const slider = document.getElementById('modal-lang-slider');
  slider.onclick = () => {
    alert(slider);
    const isGurmukhi = document.getElementById('modal-lang-slider').checked;
    const placeholderText = isGurmukhi ? 'GoSxw ie`Qy ilKo ...' : 'Add announcement text here ..';

    const $announcementText = document.querySelector('.modal-ann-box');
    alert($announcementText);
    $announcementText.classList.toggle('gurmukhi', isGurmukhi);
    $announcementText.setAttribute('data-placeholder', placeholderText);
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
  global.controller.sendText('Hello There');
  modal.close();
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
  buttonOnClick();
  isAnnouncementTab = false;
});
// change tab to announcements
modal.addFooterBtn('Announcement', 'tingle-btn tingle-btn-pull-left tingle-btn--default', () => {
  // sets up modal content (box, etc)
  modal.setContent(announcementPage);
  isAnnouncementTab = true;
  setLangSliderVal();
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
