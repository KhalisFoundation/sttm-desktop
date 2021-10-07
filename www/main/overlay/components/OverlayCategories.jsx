import React from 'react';
import PropTypes from 'prop-types';

import OverlaySetting from './OverlaySetting';
import { convertToCamelCase } from '../../common/utils';

const { remote } = require('electron');

const { i18n } = remote.require('./app');

const SettingsFactory = ({ subCategory }) => {
  const settingsDOM = [];
  Object.keys(subCategory.settingObjs).forEach((settingKey, settingIndex) => {
    settingsDOM.push(
      <div
        className={`control-item control-${subCategory.settingObjs[settingKey].type}`}
        key={`factory-${settingIndex}`}
        id={settingKey}
      >
        <OverlaySetting
          settingObj={subCategory.settingObjs[settingKey]}
          stateVar={convertToCamelCase(settingKey)}
          stateFunction={`set${convertToCamelCase(settingKey, true)}`}
        />
      </div>,
    );
  });
  return settingsDOM;
};

const OverlayCategories = ({ category }) => {
  const categoriesDOM = [];
  Object.keys(category.subCatObjs).forEach((subCat, scIndex) => {
    categoriesDOM.push(
      <div key={`control-${scIndex}`} className={`controls-container`} id={`settings-${subCat}`}>
        {category.subCatObjs[subCat].title && (
          <p className="subcategory-title">
            {i18n.t(`BANI_OVERLAY.${category.subCatObjs[subCat].title}`)}
          </p>
        )}
        <SettingsFactory subCategory={category.subCatObjs[subCat]} />
      </div>,
    );
  });

  return categoriesDOM;
};

SettingsFactory.prototypes = {
  subCategory: PropTypes.object,
};

OverlayCategories.propTypes = {
  category: PropTypes.object,
};

export default OverlayCategories;
