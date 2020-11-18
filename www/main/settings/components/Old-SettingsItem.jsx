import React from 'react';
import PropTypes from 'prop-types';

import { generateMarkup } from '../utils';

const { remote } = require('electron');

const { i18n } = remote.require('./app');

const SettingsItem = ({ subcategories, settingsKey, settingsObj }) => {
  const markup = [];
  subcategories.forEach(subCategory => {
    const controls = subCategory.settings;
    const subcategoryTitle = subCategory.title;
    const controlItems = controls.map((control, index) => {
      // const { title } = settingsObj[control];
      // const titleKey = title ? `SETTINGS.${title}.` : `SETTINGS.`;

      console.log('complete obj for', control, settingsObj[control]);

      const type = settingsObj[control].type || subCategory.type;
      // console.log('type', type);
      // console.log('options', options);
      // console.log('titleKey', titleKey);
      // console.log('settingsKey', settingsKey);
      // console.log('control', control);

      const optionItems = generateMarkup(type, settingsObj[control]);

      return (
        <div key={`control-${index}`} className={`controls-container control-${type}`}>
          <h4>{subcategoryTitle ? i18n.t(`${subcategoryTitle}SELF`) : ''}</h4>
          {optionItems}
        </div>
      );
    });
    markup.push(
      <div className="settings-container" id={subcategoryTitle}>
        {controlItems}
      </div>,
    );
  });

  return markup;
  // const { title, settings } = settingsObj;
  // const controls = Object.keys(settings);

  // const controlItems = controls.map((control, index) => {
  //   const { options, title, type } = settings[control];
  //   const titleKey = title ? `SETTINGS.${title}.` : `SETTINGS.`;

  //   const optionItems = generateMarkup(type, options, titleKey, settingsKey, control);

  //   return (
  //     <div key={`control-${index}`} className={`controls-container control-${type}`}>
  //       <h4>{title ? i18n.t(`${titleKey}SELF`) : ''}</h4>
  //       {optionItems}
  //     </div>
  //   );
  // });

  // return (
  //   <div className="settings-container" id={title}>
  //     {controlItems}
  //   </div>
  // );
};

SettingsItem.propTypes = {
  subcategories: PropTypes.array,
  settingsObj: PropTypes.object,
  settingsKey: PropTypes.string,
};

export default SettingsItem;
