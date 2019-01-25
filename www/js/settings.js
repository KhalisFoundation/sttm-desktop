const h = require('hyperscript');
const ldGet = require('lodash.get');
const settings = require('./settings.json');
const { store, analytics } = require('electron').remote.require('./app');

const defaultPrefs = store.getDefaults().userPrefs;

function updateMultipleChoiceSetting(key, val) {
  Object.keys(ldGet(settings, key)).forEach((optionToRemove) => {
    document.body.classList.remove(optionToRemove);
  });
  document.body.classList.add(val);
  global.core.platformMethod('updateSettings');
  analytics.trackEvent('settings', key, val);
}

function updateCheckboxSetting(val) {
  const classList = document.body.classList;
  classList.toggle(val);
  global.core.platformMethod('updateSettings');
  analytics.trackEvent('settings', val, classList.contains(val));
}

function updateRangeSetting(key, val) {
  const option = ldGet(settings, key);
  const optionKey = key.split('.').pop();
  for (let i = option.min; i <= option.max; i += option.step) {
    document.body.classList.remove(`${optionKey}-${i}`);
  }
  document.body.classList.add(`${optionKey}-${val}`);
  global.core.platformMethod('updateSettings');
  analytics.trackEvent('settings', optionKey, val);
}

function addDisplayTab() {
  document.getElementById('display-tab-content').innerHTML = '';
  const catKey = 'slide-layout';
  const settingKey = 'display-options';
  const userPrefs = store.getAllPrefs();
  const setting = settings[catKey].settings[settingKey];
  const switchList = h('ul');
  Object.keys(setting.options).forEach((option) => {
    const optionId = `setting-${catKey}-${settingKey}-${option}`;
    const switchListAttrs = {
      name: `setting-${catKey}-${settingKey}`,
      onclick: (e) => {
        const newVal = e.target.checked;
        store.setUserPref(`${catKey}.${settingKey}.${option}`, newVal);
        updateCheckboxSetting(option);
        if (typeof global.controller[option] === 'function') {
          global.controller[option](newVal);
        }
        if (typeof global.core[option] === 'function') {
          global.core[option](newVal);
        }
      },
      type: 'checkbox',
      value: option,
    };
    if (option === 'akhandpaatt') {
      switchListAttrs.disabled = store.get('userPrefs.slide-layout.display-options.disable-akhandpaatt');
      switchListAttrs.title = 'Disabled during casting';
    }
    if (userPrefs[catKey][settingKey][option]) {
      switchListAttrs.checked = true;
    }
    let optionLabel = setting.options[option];
    let subLabel = false;
    if (typeof setting.options[option] === 'object') {
      optionLabel = setting.options[option].label;
      subLabel = setting.options[option].subLabel;

      if (typeof subLabel === 'object') {
        subLabel = store.get(subLabel.storepref);
      }
    }

    switchList.appendChild(
      h('li',
        [
          h('span', optionLabel),
          h('div.switch',
            [
              h(`input#${optionId}`,
                switchListAttrs),
              h('label',
                {
                  htmlFor: optionId })])]));
    if (subLabel) {
      switchList.appendChild(h(`div.sub-label.${option}`, subLabel));
    }
  });
  document.getElementById('display-tab-content').appendChild(switchList);
}

function createSettingsPage(userPrefs) {
  if (document.getElementById('settings')) {
    document.getElementById('settings').remove();
  }

  const settingsPage = h('div#settings');
  Object.keys(settings).forEach((catKey) => {
    const cat = settings[catKey];
    settingsPage.appendChild(
      h('h2', cat.title));
    const settingCat = h('section.block-list');

    Object.keys(cat.settings).forEach((settingKey) => {
      const setting = cat.settings[settingKey];
      settingCat.appendChild(
        h('header', setting.title));
      switch (setting.type) {
        case 'checkbox': {
          const checkboxList = h('ul');
          Object.keys(setting.options).forEach((option) => {
            const optionId = `setting-${catKey}-${settingKey}-${option}`;
            const checkboxListAttrs = {
              name: `setting-${catKey}-${settingKey}`,
              onclick: (e) => {
                const newVal = e.target.checked;
                store.setUserPref(`${catKey}.${settingKey}.${option}`, newVal);
                updateCheckboxSetting(option);
              },
              type: 'checkbox',
              value: option,
            };
            if (userPrefs[catKey][settingKey][option]) {
              checkboxListAttrs.checked = true;
            }
            checkboxList.appendChild(
              h('li',
                [
                  h(`input#${optionId}`,
                    checkboxListAttrs),
                  h('label',
                    {
                      htmlFor: optionId },
                    setting.options[option])]));
          });
          settingCat.appendChild(checkboxList);
          break;
        }
        case 'radio': {
          const radioList = h('ul');
          Object.keys(setting.options).forEach((option) => {
            const optionId = `setting-${catKey}-${settingKey}-${option}`;
            const radioListAttrs = {
              name: `setting-${catKey}-${settingKey}`,
              onclick: () => {
                store.setUserPref(`${catKey}.${settingKey}`, option);
                updateMultipleChoiceSetting(`${catKey}.settings.${settingKey}.options`, option);
              },
              type: 'radio',
              value: option,
            };
            if (userPrefs[catKey][settingKey] === option) {
              radioListAttrs.checked = true;
            }
            radioList.appendChild(
              h('li',
                [
                  h(`input#${optionId}`,
                    radioListAttrs),
                  h('label',
                    {
                      htmlFor: optionId },
                    setting.options[option])]));
          });
          settingCat.appendChild(radioList);
          break;
        }
        case 'range': {
          const rangeList = h('ul');
          Object.keys(setting.options).forEach((optionKey) => {
            const option = setting.options[optionKey];
            const optionId = `setting-${catKey}-${settingKey}-${optionKey}`;
            const switchListAttrs = {
              'data-value': userPrefs[catKey][settingKey][optionKey],
              max: option.max,
              min: option.min,
              onchange: (e) => {
                const newVal = e.target.value;
                e.target.dataset.value = newVal;
                store.setUserPref(`${catKey}.${settingKey}.${optionKey}`, newVal);
                updateRangeSetting(`${catKey}.settings.${settingKey}.options.${optionKey}`, newVal);
              },
              step: option.step,
              type: 'range',
              value: userPrefs[catKey][settingKey][optionKey],
            };
            rangeList.appendChild(
              h('li',
                [
                  h('span', [
                    option.title,
                    h('i', `(Default: ${defaultPrefs[catKey][settingKey][optionKey]})`),
                  ]),
                  h('div.range',
                    [
                      h(`input#${optionId}`,
                        switchListAttrs),
                      h('label',
                        {
                          htmlFor: optionId })])]));
          });
          settingCat.appendChild(rangeList);
          break;
        }
        case 'switch': {
          const switchList = h('ul');
          Object.keys(setting.options).forEach((option) => {
            const optionId = `setting-${catKey}-${settingKey}-${option}`;
            let disabled = false;

            if (option === 'akhandpaatt') {
              disabled = store.get('userPrefs.slide-layout.display-options.disable-akhandpaatt');
            }

            const switchListAttrs = {
              name: `setting-${catKey}-${settingKey}`,
              onclick: (e) => {
                const newVal = e.target.checked;
                store.setUserPref(`${catKey}.${settingKey}.${option}`, newVal);
                updateCheckboxSetting(option);
                if (typeof global.controller[option] === 'function') {
                  global.controller[option](newVal);
                }
                if (typeof global.core[option] === 'function') {
                  global.core[option](newVal);
                }
              },
              type: 'checkbox',
              value: option,
              disabled,
            };
            if (userPrefs[catKey][settingKey][option]) {
              switchListAttrs.checked = true;
            }

            let optionLabel = setting.options[option];
            let subLabel = false;
            if (typeof setting.options[option] === 'object') {
              optionLabel = setting.options[option].label;
              subLabel = setting.options[option].subLabel;
              if (typeof subLabel === 'object') {
                subLabel = store.get(subLabel.storepref);
              }
            }

            switchList.appendChild(
              h('li',
                [
                  h('span', optionLabel),
                  h('div.switch',
                    [
                      h(`input#${optionId}`,
                        switchListAttrs),
                      h('label',
                        {
                          htmlFor: optionId })])]));
            if (subLabel) {
              switchList.appendChild(h(`div.sub-label.${option}`, subLabel));
            }
          });
          settingCat.appendChild(switchList);
          break;
        }
        default:
          break;
      }
      settingsPage.appendChild(settingCat);
    });

    settingsPage.appendChild(settingCat);
  });
  return settingsPage;
}

module.exports = {
  init() {
    const userPrefs = store.getAllPrefs();
    this.settingsPage = createSettingsPage(userPrefs);
    document.querySelector('#menu-page').appendChild(this.settingsPage);
    addDisplayTab();
    this.applySettings();
  },

  applySettings(prefs = false) {
    const newUserPrefs = prefs || store.getAllPrefs();
    Object.keys(settings).forEach((catKey) => {
      const cat = settings[catKey];
      Object.keys(cat.settings).forEach((settingKey) => {
        const setting = cat.settings[settingKey];
        switch (setting.type) {
          case 'checkbox':
          case 'switch':
            Object.keys(setting.options).forEach((option) => {
              if (newUserPrefs[catKey][settingKey][option]) {
                document.body.classList.add(option);
              } else {
                document.body.classList.remove(option);
              }
            });
            break;
          case 'radio':
            Object.keys(setting.options).forEach((optionToRemove) => {
              document.body.classList.remove(optionToRemove);
            });
            document.body.classList.add(newUserPrefs[catKey][settingKey]);
            break;

          case 'range':
            Object.keys(setting.options).forEach((optionKey) => {
              const option = setting.options[optionKey];
              for (let i = option.min; i <= option.max; i += option.step) {
                document.body.classList.remove(`${optionKey}-${i}`);
              }
              document.body.classList.add(`${optionKey}-${newUserPrefs[catKey][settingKey][optionKey]}`);
            });
            break;

          default:
            break;
        }
      });
    });
  },
  changeFontSize(iconType, operation) {
    const range = settings['slide-layout'].settings['font-sizes'].options[iconType];
    const existingSize = parseInt(store.getUserPref(`slide-layout.font-sizes.${iconType}`), 10);
    document.body.classList.remove(`${iconType}-${existingSize}`);

    let newSize;

    if (operation === 'plus' && existingSize < range.max) {
      newSize = existingSize + range.step;
    } else if (operation === 'minus' && existingSize > range.min) {
      newSize = existingSize - range.step;
    }
    document.body.classList.add(`${iconType}-${newSize}`);
    store.setUserPref(`slide-layout.font-sizes.${iconType}`, newSize);
    global.platform.updateSettings();
    analytics.trackEvent('settings', `${iconType}`, newSize);
  },
  showHide(e, type) {
    const catKey = 'slide-layout';
    const settingKey = 'fields';
    const option = `display-${type}`;
    document.body.classList.toggle(option);
    const newVal = document.body.classList.contains(option);
    store.setUserPref(`${catKey}.${settingKey}.${option}`, newVal);
    global.platform.updateSettings();
    analytics.trackEvent('settings', `${option}`, newVal);
  },
};
