const h = require('hyperscript');
const ip = require('ip');
const copy = require('copy-to-clipboard');

const host = ip.address();

const remote = require('electron').remote;

const overlayPort = remote.getGlobal('overlayPort');
const url = `http://${host}:${overlayPort}/`;

const { store } = require('electron').remote.require('./app');

const overlayVars = store.get('obs').overlayPrefs.overlayVars;

const getJSONfromClientRect = clientRect => ({
  bottom: clientRect.bottom,
  height: clientRect.height,
  left: clientRect.left,
  right: clientRect.right,
  top: clientRect.top,
  width: clientRect.width,
});

const savePrefs = () => {
  store.set('obs', {
    overlayPrefs: {
      overlayVars,
      gurbani: getJSONfromClientRect(document.querySelector('.o-gurbani').getBoundingClientRect()),
      teeka: getJSONfromClientRect(document.querySelector('.o-teeka').getBoundingClientRect()),
      translation: getJSONfromClientRect(document.querySelector('.o-translation').getBoundingClientRect()),
      transliteration: getJSONfromClientRect(document.querySelector('.o-transliteration').getBoundingClientRect()),
    },
  });
};

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

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);

  return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : null;
}

function updateContentBar(value, prop) {
  document.querySelectorAll('.content-bar').forEach((el) => {
    el.style[prop] = value; // eslint-disable-line no-param-reassign
  });
}

function updateGurbaniBar(value, prop) {
  document.querySelector('.o-gurbani').style[prop] = value;
}

const changeColor = (e) => {
  const color = e.target.value;
  updateContentBar(color, 'color');
  updateGurbaniBar(overlayVars.gurbaniTextColor, 'color');
  overlayVars.textColor = color;
  savePrefs();
};

const changeGurbaniColor = (e) => {
  const color = e.target.value;
  updateGurbaniBar(color, 'color');
  overlayVars.gurbaniTextColor = color;
  savePrefs();
};

const changeBg = (e) => {
  const color = e.target.value;

  updateContentBar(`rgba(${hexToRgb(color)}, ${overlayVars.bgOpacity})`, 'backgroundColor');
  overlayVars.bgColor = color;
  savePrefs();
};

const topLayoutApply = () => {
  overlayVars.layout = 'top';
  document.querySelector('.o-gurbani').style.top = '0';
  document.querySelector('.o-gurbani').style.bottom = 'auto';
  document.querySelector('.o-teeka').style.display = 'none';
  document.querySelector('.o-transliteration').style.display = 'none';
  document.querySelector('.o-translation').style.top = `${overlayVars.height}px`;
  document.querySelector('.o-translation').style.bottom = 'auto';
};

const bottomLayoutApply = () => {
  overlayVars.layout = 'bottom';
  document.querySelector('.o-gurbani').style.top = 'auto';
  document.querySelector('.o-gurbani').style.bottom = `${overlayVars.height}px`;
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
  document.querySelector('.o-teeka').style.top = `${overlayVars.height}px`;
  document.querySelector('.o-teeka').style.bottom = 'auto';
  document.querySelector('.o-transliteration').style.display = 'block';
  document.querySelector('.o-transliteration').style.top = 'auto';
  document.querySelector('.o-transliteration').style.bottom = `${overlayVars.height}px`;
  document.querySelector('.o-translation').style.top = 'auto';
  document.querySelector('.o-translation').style.bottom = '0';
};

function applyLayout() {
  switch (overlayVars.layout) {
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
}

const updateSize = (newSize, prop) => {
  updateContentBar(newSize, prop);
  applyLayout();
};
const updateGurbaniSize = (newSize, prop) => {
  document.querySelector('.o-gurbani').style[prop] = newSize;
};

const increaseBarSize = () => {
  const size = overlayVars.height;
  const newSize = size < 100 ? size + 2 : 100;

  overlayVars.height = newSize;
  savePrefs();
  updateSize(`${newSize}px`, 'height');
};
const decreaseBarSize = () => {
  const size = overlayVars.height;
  const newSize = size > 33 ? size - 2 : 33;

  overlayVars.height = newSize;
  savePrefs();
  updateSize(`${newSize}px`, 'height');
};

const increasefontSize = () => {
  const size = overlayVars.fontSize;
  const gurbaniSize = overlayVars.gurbaniFontSize;
  const newSize = size < 40 ? size + 1 : 40;
  updateSize(`${newSize}px`, 'fontSize');
  updateGurbaniSize(`${gurbaniSize}px`, 'fontSize');
  overlayVars.fontSize = newSize;
  savePrefs();
};
const decreasefontSize = () => {
  const size = overlayVars.fontSize;
  const gurbaniSize = overlayVars.gurbaniFontSize;
  const newSize = size > 5 ? size - 1 : 5;

  updateSize(`${newSize}px`, 'fontSize');
  updateGurbaniSize(`${gurbaniSize}px`, 'fontSize');
  overlayVars.fontSize = newSize;
  savePrefs();
};

const increaseGurbanifontSize = () => {
  const size = overlayVars.gurbaniFontSize;
  const newSize = size < 60 ? size + 1 : 60;
  updateGurbaniSize(`${newSize}px`, 'fontSize');
  overlayVars.gurbaniFontSize = newSize;
  savePrefs();
};
const decreaseGurbanifontSize = () => {
  const size = overlayVars.gurbaniFontSize;
  const newSize = size > 5 ? size - 1 : 5;

  updateGurbaniSize(`${newSize}px`, 'fontSize');
  overlayVars.gurbaniFontSize = newSize;
  savePrefs();
};

const increaseOpacity = () => {
  const opacity = overlayVars.bgOpacity;
  const newSize = opacity > 0.9 ? 1 : opacity + 0.1;

  updateContentBar(`rgba(${hexToRgb(overlayVars.bgColor)}, ${newSize})`, 'backgroundColor');
  overlayVars.bgOpacity = newSize;
  savePrefs();
};
const decreaseOpacity = () => {
  const opacity = overlayVars.bgOpacity;
  const newSize = opacity < 0.1 ? 0 : opacity - 0.1;

  updateContentBar(`rgba(${hexToRgb(overlayVars.bgColor)}, ${newSize})`, 'backgroundColor');
  overlayVars.bgOpacity = newSize;
  savePrefs();
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
        savePrefs();
      },
    },
  ),
);

const resizeButtonFactory = (increaseFunc, decreaseFunc) => h(
  'div.input-wrap.resize-btn',
  h(
    'span.export-btn',
    {
      onclick: () => {
        decreaseFunc();
      },
    },
    h('i.fa.fa-minus-circle.cp-icon'),
  ),
  h(
    'span.export-btn',
    {
      onclick: () => {
        increaseFunc();
      },
    },
    h('i.fa.fa-plus-circle.cp-icon'),
  ),
);


const copyURLButton = h(
  'div.input-wrap',
  {
    title: `${url}`,
    onclick: () => {
      copy(url);
    },
  },
  h(
    'div.export-btn',
    h('i.fa.fa-files-o.cp-icon'),
  ),
  h(
    'div.setting-label',
    'Copy URL',
  ),
);

const topLayoutBtn = layoutButtonFactory('top', topLayoutApply);
const bottomLayoutBtn = layoutButtonFactory('bottom', bottomLayoutApply);
const topBottomLayoutBtn = layoutButtonFactory('top-bottom', splitLayoutApply);
const gurbaniColor = colorInputFactory('toggle-text', 'Gurbani', overlayVars.gurbaniTextColor, changeGurbaniColor);
const textColor = colorInputFactory('toggle-text', 'Text', overlayVars.textColor, changeColor);
const backgroundColor = colorInputFactory('background', 'BG', overlayVars.bgColor, changeBg);
const changeBarSizeButton = resizeButtonFactory(increaseBarSize, decreaseBarSize);
const changefontSizeButton = resizeButtonFactory(increasefontSize, decreasefontSize);
const changeGurbanifontSizeButton = resizeButtonFactory(
  increaseGurbanifontSize, decreaseGurbanifontSize,
);
const changeOpacityButton = resizeButtonFactory(increaseOpacity, decreaseOpacity);

const controlPanel = document.querySelector('.control-panel');
controlPanel.append(gurbaniColor);
controlPanel.append(changeGurbanifontSizeButton);
controlPanel.append(textColor);
controlPanel.append(changefontSizeButton);
controlPanel.append(separator);
controlPanel.append(backgroundColor);
controlPanel.append(changeBarSizeButton);
controlPanel.append(h(
  'div.setting-label',
  'Size',
));
controlPanel.append(changeOpacityButton);
controlPanel.append(h(
  'div.setting-label',
  'Opacity',
));
controlPanel.append(separator.cloneNode(true));
controlPanel.append(bottomLayoutBtn);
controlPanel.append(topLayoutBtn);
controlPanel.append(topBottomLayoutBtn);
controlPanel.append(separator.cloneNode(true));
controlPanel.append(copyURLButton);

// apply the saved preferences when a new overlay window is opened.
applyLayout();
updateContentBar(`rgba(${hexToRgb(overlayVars.bgColor)}, ${overlayVars.bgOpacity})`, 'backgroundColor');
updateContentBar(overlayVars.textColor, 'color');
updateGurbaniBar(overlayVars.gurbaniTextColor, 'color');
updateSize(`${overlayVars.height}px`, 'height');
updateSize(`${overlayVars.fontSize}px`, 'fontSize');
updateGurbaniBar(`${overlayVars.gurbaniFontSize}px`, 'fontSize');

