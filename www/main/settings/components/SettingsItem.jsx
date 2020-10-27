import React from 'react';
import PropTypes from 'prop-types';

import { generateSwitchMarkup, generateDropdownMarkup, generateRangeMarkup } from '../utils';

const { remote } = require('electron');
const { i18n } = remote.require('./app');

const SettingsItem = ({ settingsObj }) => {
  const { title, settings } = settingsObj;
  const controls = Object.keys(settings);

  const controlItems = controls.map((control, index) => {
    const { options, title, type } = settings[control];
    const titleKey = title ? `SETTINGS.${title}.` : `SETTINGS.`;
    let optionItems = [];

    if (type === 'switch') {
      optionItems = optionItems.concat(generateSwitchMarkup(options, titleKey));
    } else if (type === 'dropdown') {
      optionItems = optionItems.concat(generateDropdownMarkup(options, titleKey));
    } else if (type === 'range') {
      optionItems = optionItems.concat(generateRangeMarkup(options, titleKey));
    }

    return (
      <div key={`control-${index}`} className={`controls-container control-${type}`}>
        <h4>{title ? i18n.t(`${titleKey}SELF`) : ''}</h4>
        {optionItems}
      </div>
    );
  });

  return (
    <div className="settings-container" id={title}>
      {controlItems}
    </div>
  );
};

SettingsItem.propTypes = {
  settingsObj: PropTypes.object,
};

export default SettingsItem;
