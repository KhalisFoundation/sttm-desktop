const interact = require('interactjs');
const h = require('hyperscript');
const fs = require('fs');

const overlayVars = {};

function dragMoveListener(event) {
  const target = event.target;
  const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
  const y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;

  // translate the element
  target.style.transform = `translate(${x}px, ${y}px)`;

  // update the posiion attributes
  target.setAttribute('data-x', x);
  target.setAttribute('data-y', y);
}

const defaulutResizeObject = {
  // resize from all edges and corners
  edges: { left: true, right: true, bottom: true, top: true },

  margin: 10,

  // keep the edges inside the parent
  restrictEdges: {
    outer: 'parent',
    endOnly: true,
  },

  inertia: true,
};

interact('.content-bar').draggable({
  inertia: true,
  restrict: {
    restriction: 'parent',
    endOnly: true,
    elementRect: { top: 0, left: 0, bottom: 1, right: 1 },
  },
  onmove: dragMoveListener,
}).resizable(defaulutResizeObject).on('resizemove', (event) => {
  const target = event.target;
  let x = (parseFloat(target.getAttribute('data-x')) || 0);
  let y = (parseFloat(target.getAttribute('data-y')) || 0);

  // update the element's style
  target.style.width = `${event.rect.width}px`;
  target.style.height = `${event.rect.height}px`;
  // translate when resizing from top or left edges
  x += event.deltaRect.left;
  y += event.deltaRect.top;

  target.style.transform = `translate(${x}px, ${y}px)`;

  target.setAttribute('data-x', x);
  target.setAttribute('data-y', y);
});


const colorInputFactory = (inputName, label, defaultColor, onchangeAction) => h(
  `div.${inputName}.input-wrap`,
  h(
    `input.${inputName}.color-input`,
    {
      type: 'color',
      onchange: onchangeAction,
      value: defaultColor,
    },
  ),
  h(
    'div.setting-label',
    label,
  ),
);

const changeColor = (e) => {
  document.querySelectorAll('.content-bar').forEach((el) => {
    el.style.color = e.target.value; // eslint-disable-line no-param-reassign
    overlayVars.textColor = e.target.value;
  });
};

const changeBg = (e) => {
  document.querySelectorAll('.content-bar').forEach((el) => {
    el.style.backgroundColor = e.target.value; // eslint-disable-line no-param-reassign
    overlayVars.bgColor = e.target.value;
  });
};

const topLayoutApply = () => {
  overlayVars.layout = 'top';
  document.querySelector('.o-gurbani').style.top = '0';
  document.querySelector('.o-gurbani').style.bottom = 'auto';
  document.querySelector('.o-teeka').style.display = 'none';
  document.querySelector('.o-transliteration').style.display = 'none';
  document.querySelector('.o-translation').style.top = '42px';
  document.querySelector('.o-translation').style.bottom = 'auto';
};

const bottomLayoutApply = () => {
  overlayVars.layout = 'bottom';
  document.querySelector('.o-gurbani').style.top = 'auto';
  document.querySelector('.o-gurbani').style.bottom = '36px';
  document.querySelector('.o-translation').style.top = 'auto';
  document.querySelector('.o-translation').style.bottom = '0';
  document.querySelector('.o-teeka').style.display = 'none';
  document.querySelector('.o-transliteration').style.display = 'none';
};

const splitLayoutApply = () => {
  overlayVars.layout = 'split';
  document.querySelector('.o-gurbani').style.top = '0';
  document.querySelector('.o-gurbani').style.bottom = 'auto';
  document.querySelector('.o-teeka').style.display = 'block';
  document.querySelector('.o-teeka').style.top = '42px';
  document.querySelector('.o-teeka').style.bottom = 'auto';
  document.querySelector('.o-transliteration').style.display = 'block';
  document.querySelector('.o-transliteration').style.top = 'auto';
  document.querySelector('.o-transliteration').style.bottom = '36px';
  document.querySelector('.o-translation').style.top = 'auto';
  document.querySelector('.o-translation').style.bottom = '0';
};

const separator = h('div.separator');

const layoutButtonFactory = (layoutName, layoutFunc) => h(
  'div.input-wrap',
  h(
    `div.layout-btn.${layoutName}`,
    h('div.layout-bar.layout-bar-1'),
    h('div.layout-bar.layout-bar-2'),
    h('div.layout-bar.layout-bar-3'),
    h('div.layout-bar.layout-bar-4'),
    {
      onclick: () => {
        document.querySelectorAll('.content-bar').forEach((bar) => {
          bar.style.transform = 'none'; // eslint-disable-line no-param-reassign
        });
        layoutFunc();
      },
    },
  ),
);

const getJSONfromClientRect = clientRect => ({
  bottom: clientRect.bottom,
  height: clientRect.height,
  left: clientRect.left,
  right: clientRect.right,
  top: clientRect.top,
  width: clientRect.width,
});

const exportButton = h(
  'div.input-wrap',
  {
    onclick: () => {
      const exportData = {
        overlayPrefs: {
          overlayVars,
          gurbani: getJSONfromClientRect(document.querySelector('.o-gurbani').getBoundingClientRect()),
          teeka: getJSONfromClientRect(document.querySelector('.o-teeka').getBoundingClientRect()),
          translation: getJSONfromClientRect(document.querySelector('.o-translation').getBoundingClientRect()),
          transliteration: getJSONfromClientRect(document.querySelector('.o-transliteration').getBoundingClientRect()),
        },
      };
      fs.writeFile('www/obs/overlay.json', JSON.stringify(exportData), (err) => {
        if (err) throw err;
      });
    },
  },
  h(
    'div.export-btn',
    h('i.fa.fa-save.cp-icon'),
  ),
  h(
    'div.setting-label',
    'Save',
  ),
);

const topLayoutBtn = layoutButtonFactory('top', topLayoutApply);
const bottomLayoutBtn = layoutButtonFactory('bottom', bottomLayoutApply);
const topBottomLayoutBtn = layoutButtonFactory('top-bottom', splitLayoutApply);

const textColor = colorInputFactory('toggle-text', 'Text', '#f1c40f', changeColor);
const backgroundColor = colorInputFactory('background', 'BG', '#2c3e50', changeBg);

const controlPanel = document.querySelector('.control-panel');
controlPanel.append(textColor);
controlPanel.append(backgroundColor);
controlPanel.append(separator);
controlPanel.append(bottomLayoutBtn);
controlPanel.append(topLayoutBtn);
controlPanel.append(topBottomLayoutBtn);
controlPanel.append(separator.cloneNode(true));
controlPanel.append(exportButton);
