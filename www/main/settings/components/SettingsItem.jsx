import React from 'react';
import PropTypes from 'prop-types';

import { generateMarkup } from '../utils';

const { remote } = require('electron');
const { i18n } = remote.require('./app');

const SettingsItem = ({ settingsObj, settingsKey }) => {
  const { title, settings } = settingsObj;
  const controls = Object.keys(settings);

  const controlItems = controls.map((control, index) => {
    const { options, title, type } = settings[control];
    const titleKey = title ? `SETTINGS.${title}.` : `SETTINGS.`;

    const optionItems = generateMarkup(type, options, titleKey, settingsKey, control);

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
