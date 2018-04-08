const h = require('hyperscript');
const settings = require('./settings');

const menuButton = h(
  'a.menu-button.navigator-button.active',
  h('i.fa.fa-bars'));
const closeButton = h(
  'a.close-button.navigator-button',
  {
    onclick: () => {
      module.exports.toggleMenu('#menu-page');
    } },
  h('i.fa.fa-times'));
const customSlidesButton = h(
  'a#custom-slide-menu.navigator-button.active',
  {
    onclick: () => {
      module.exports.toggleMenu('#custom-slides-page');
    } },
  h('i.fa.fa-clone'));
const customSlidesCloseButton = h(
  'a.close-button.navigator-button',
  {
    onclick: () => {
      module.exports.toggleMenu('#custom-slides-page');
    } },
  h('i.fa.fa-times'));
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

    const $listOfCustomSlides = document.querySelector('#list-of-custom-slides');
    $listOfCustomSlides.appendChild(emptySlideButton);
    $listOfCustomSlides.appendChild(waheguruSlideButton);
    $listOfCustomSlides.appendChild(dhanGuruSlideButton);
    $listOfCustomSlides.appendChild(announcementSlideButton);
    settings.init();
  },

  toggleMenu(pageSelector = '#menu-page') {
    document.querySelector(pageSelector).classList.toggle('active');
  },
};
