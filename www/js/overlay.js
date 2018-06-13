const h = require('hyperscript');

const { store } = require('electron').remote.require('./app');

const overlayVars = {};

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
function updateContentBarColor(color, prop) {
  document.querySelectorAll('.content-bar').forEach((el) => {
    el.style[prop] = color; // eslint-disable-line no-param-reassign
  });
}

const changeColor = (e) => {
  const color = e.target.value;
  updateContentBarColor(color, 'color');
  overlayVars.textColor = color;
};

const changeBg = (e) => {
  const color = e.target.value;
  updateContentBarColor(color, 'backgroundColor');
  overlayVars.bgColor = color;
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
      store.set('obs', {
        overlayPrefs: {
          overlayVars,
          gurbani: getJSONfromClientRect(document.querySelector('.o-gurbani').getBoundingClientRect()),
          teeka: getJSONfromClientRect(document.querySelector('.o-teeka').getBoundingClientRect()),
          translation: getJSONfromClientRect(document.querySelector('.o-translation').getBoundingClientRect()),
          transliteration: getJSONfromClientRect(document.querySelector('.o-transliteration').getBoundingClientRect()),
        },
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

// apply the saved preferences when a new overlay window is opened.
const overlayPrefs = store.get('obs').overlayPrefs;

switch (overlayPrefs.overlayVars.layout) {
  case 'top':
    topLayoutApply();
    break;
  case 'bottom':
    bottomLayoutApply();
    break;
  case 'split':
    splitLayoutApply();
    break;
  default :
    break;
}
updateContentBarColor(overlayPrefs.overlayVars.bgColor, 'backgroundColor');
updateContentBarColor(overlayPrefs.overlayVars.textColor, 'color');
