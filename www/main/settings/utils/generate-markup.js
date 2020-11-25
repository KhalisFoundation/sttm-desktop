import React from 'react';

// import Checkbox from '../../common/sttm-ui/checkbox';
import Switch from '../../common/sttm-ui/switch';

// const { remote } = require('electron');

// const { store, i18n } = remote.require('./app');

// const userPrefs = store.getAllPrefs();
// const defaultPrefs = store.getDefaults().userPrefs;

const generateMarkup = (type, controlObj) => {
  let itemsMarkup;

  const { title, initialValue } = controlObj;

  switch (type) {
    case 'range':
      itemsMarkup = (
        <div
          key={`control-item-range-${title}`}
          className={`control-item ${title}-range`}
          id={`${title}-range-id`}
        >
          <span>{title}</span>
          <input type="range" data-value={initialValue} value={initialValue}></input>
        </div>
      );
      break;
    case 'dropdown':
      itemsMarkup = (
        <div
          key={`control-item-dropdown-${title}`}
          className={`control-item ${title}`}
          id={`${title}-switch`}
        >
          <span>{title}</span>
          <select
            value={initialValue}
            onChange={() => {
              // console.log('changed the dropdown');
            }}
          >
            {Object.keys(controlObj.options).map((op, opIndex) => (
              <option key={`control-dropdown-options-${opIndex}`}>{controlObj.options[op]}</option>
            ))}
          </select>
        </div>
      );
      break;
    case 'switch':
      itemsMarkup = (
        <Switch
          key={`control-item-switch-${title}`}
          title={title}
          controlId={`${title}-switch`}
          className={`control-item ${title}`}
          value={false}
          onToggle={() => {
            // console.log('switched the switch');
          }}
        />
      );
      break;
    default:
      itemsMarkup = <p>No support yet</p>;
  }
  return itemsMarkup;
};

export default generateMarkup;
