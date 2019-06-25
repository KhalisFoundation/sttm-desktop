const tingle = require('./vendor/tingle');
const strings = require('./strings');

const modal = new tingle.Modal({
  footer: true,
  stickyFooter: false,
  closeMethods: ['overlay', 'button', 'escape'],
  onClose() {},
  beforeClose() {
    // here's goes some logic
    // e.g. save content before closing the modal
    return true; // close the modal
  },
});

// slide modal  body
const slideHeader = '<h1 class = "modalTitle"> <center> Insert Slide </center></h1>';
const slideText = '<text class="dhanguru">Insert Slide: Dhan Guru </text>';
const buttons = '<div class="buttons">'.concat(
  '<table class="buttonTables">',
  '<tr>',
  '<td><button class="guru" id="guru1">Click Me!</button></td>',
  '</tr>',
);

modal.setContent(slideHeader + slideText + buttons);
modal.addFooterBtn('Ok', 'tingle-btn tingle-btn--pull-right tingle-btn--default', () => {
  // here goes some logic
  global.controller.sendText('Hello There');
  modal.close();
});
modal.addFooterBtn('Close', 'tingle-btn tingle-btn--pull-right tingle-btn--danger', () => {
  modal.close();
});
modal.addFooterBtn('Slides', 'tingle-btn tingle-btn-pull-left tingle-btn--default', () => {
  modal.setContent('<tingle-btn>Hi!</tingle-btn>');
});
modal.addFooterBtn('Announcement', 'tingle-btn tingle-btn-pull-left tingle-btn--default', () => {
  modal.setContent('<h1> <center>Insert Announcement</center></h1>');
});

function openModal() {
  modal.open();
}

module.exports = {
  openModal,
};
