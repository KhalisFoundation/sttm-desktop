import React from 'react';

import Checkbox from '../../common/sttm-ui/checkbox';
import Switch from '../../common/sttm-ui/switch';

const { remote } = require('electron');

const { store, i18n } = remote.require('./app');

const userPrefs = store.getAllPrefs();
const defaultPrefs = store.getDefaults().userPrefs;

const generateMarkup = (type, options, titleKey, settingsKey, control) => {
  const items = Object.keys(options).map((name, index) => {
    let controlname = options[name].title;
    const dropdownOptions = options[name].options;
    const { max, min, step, checkbox } = options[name];

    let savedValue;
    let checkBoxValue;

    try {
      savedValue = userPrefs[settingsKey][control][name];
      if (checkbox) {
        checkBoxValue = userPrefs[settingsKey].fields[checkbox];
        console.log('checkbox for', settingsKey, checkBoxValue);
      }
    } catch (e) {
      console.log('for default');
      console.log(settingsKey, control, name, checkbox);
      savedValue = defaultPrefs[settingsKey][control][name];
      if (checkbox) {
        checkBoxValue = defaultPrefs[settingsKey].fields[checkbox];
      }
    }

    switch (type) {
      case 'range':
        return (
          <div
            key={`control-item-range-${index}`}
            className={`control-item ${name}-range`}
            id={`${name}-range-id`}
          >
            {checkbox ? (
              <Checkbox
                id={checkbox}
                name={checkbox}
                value={checkbox}
                checked={checkBoxValue}
                label={i18n.t(`${titleKey}${controlname}`)}
                handler={() => {
                  console.log('clicked the checkbox');
                }}
              />
            ) : (
              <span>{i18n.t(`${titleKey}${controlname}`)}</span>
            )}
            <input
              type="range"
              data-value={savedValue}
              min={min}
              max={max}
              step={step}
              value={savedValue}
            ></input>
          </div>
        );
      case 'dropdown':
        return (
          <div
            key={`control-item-dropdown-${index}`}
            className={`control-item ${name}`}
            id={`${name}-switch`}
          >
            <span>{i18n.t(`${titleKey}${controlname}`)}</span>
            <select
              value={savedValue}
              onChange={() => {
                console.log('changed the dropdown');
              }}
            >
              {Object.keys(dropdownOptions).map((op, opIndex) => (
                <option key={`control-dropdown-options-${opIndex}`}>
                  {i18n.t(`${titleKey}${dropdownOptions[op]}`)}
                </option>
              ))}
            </select>
          </div>
        );
      case 'switch':
        controlname = typeof options[name] === 'object' ? options[name].label : options[name];
        return (
          <Switch
            key={`control-item-switch-${index}`}
            title={i18n.t(`${titleKey}${controlname}`)}
            controlId={`${name}-switch`}
            className={`control-item ${name}`}
            value={savedValue}
            onToggle={() => {
              console.log('switched the switch');
            }}
          />
        );
    }
  });
  return items;
};

export default generateMarkup;
