import React from 'react';
import PropTypes from 'prop-types';

import Setting from './Setting';
import { convertToCamelCase } from '../../common/utils';

const remote = require('@electron/remote');

const { store, i18n } = remote.require('./app');

const SettingsFactory = ({ subCategory }) => {
  const settingsDOM = [];
  Object.keys(subCategory.settingObjs).forEach((settingKey, settingIndex) => {
    const { addonObj, addon } = subCategory.settingObjs[settingKey];
    settingsDOM.push(
      /* 1. Push the Addon first */
      <div className="control-item" id={settingKey} key={settingIndex}>
        {addon && (
          <Setting
            settingObj={addonObj}
            stateVar={convertToCamelCase(addon)}
            stateFunction={`set${convertToCamelCase(addon, true)}`}
          />
        )}
        {/* 2. Then add title */}
        <span>{i18n.t(`SETTINGS.${subCategory.settingObjs[settingKey].title}`)}</span>

        {/* 3. Push notes and default value text */}
        <span className="notes">
          {subCategory.settingObjs[settingKey].notes &&
            i18n.t(`SETTINGS.${subCategory.settingObjs[settingKey].notes}`)}
          {subCategory.settingObjs[settingKey].type === 'range' &&
            `(Default: ${subCategory.settingObjs[settingKey].initialValue})`}
          {subCategory.settingObjs[settingKey].store &&
            store.get(subCategory.settingObjs[settingKey].store)}
        </span>

        {/* 4. Push the setting input */}
        <Setting
          settingObj={subCategory.settingObjs[settingKey]}
          stateVar={convertToCamelCase(settingKey)}
          stateFunction={`set${convertToCamelCase(settingKey, true)}`}
        />
      </div>,
    );
  });
  return settingsDOM;
};

const Categories = ({ category }) => {
  const categoriesDOM = [];
  Object.keys(category.subCatObjs).forEach((subCat, scIndex) => {
    categoriesDOM.push(
      <div key={`control-${scIndex}`} className={`controls-container`} id={`settings-${subCat}`}>
        <h4>{i18n.t(`SETTINGS.${category.subCatObjs[subCat].title}`)}</h4>
        <SettingsFactory subCategory={category.subCatObjs[subCat]} />
      </div>,
    );
  });

  return categoriesDOM;
};

SettingsFactory.prototypes = {
  subCategory: PropTypes.object,
};

Categories.propTypes = {
  category: PropTypes.object,
};

export default Categories;
