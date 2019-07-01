const tingle = require('./vendor/tingle');
const strings = require('./strings');

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
const slideHeader = '<h1 class = "modalTitle"> <center> Insert Slide </center></h1>';
const slideText = '<h2 class ="dhanguru">Dhan Guru:</h2>';
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
const announcementBox =
  '<div class = "announcementBox" contentEditable="true" placeholder="Enter Text Here"></div>';

/**
 * sets each dhan guru button an onclick that will send taht guru's name to the slide
 */
function buttonOnClick() {
  for (let i = 1; i <= 11; i += 1) {
    document.getElementById(`guru${i}`).onclick = () => {
      global.controller.sendText(strings.slideStrings.dhanguruStrings[i - 1], true);
      modal.close();
    };
  }
}
const slidePage = slideHeader + slideText + buttons;
modal.setContent(slidePage);
modal.addFooterBtn('Ok', 'tingle-btn tingle-btn--pull-right tingle-btn--default', () => {
  // here goes some logic
  global.controller.sendText('Hello There');
  modal.close();
});
modal.addFooterBtn('Close', 'tingle-btn tingle-btn--pull-right tingle-btn--danger', () => {
  modal.close();
});
modal.addFooterBtn('Slides', 'tingle-btn tingle-btn-pull-left tingle-btn--default', () => {
  modal.setContent(slidePage);
  buttonOnClick();
});
modal.addFooterBtn('Announcement', 'tingle-btn tingle-btn-pull-left tingle-btn--default', () => {
  modal.setContent(announcementBox);
});

function openModal() {
  modal.open();
}

module.exports = {
  openModal,
  buttonOnClick,
};
