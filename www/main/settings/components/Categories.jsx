import React from 'react';
import PropTypes from 'prop-types';

import Setting from './Setting';
import { convertToCamelCase } from '../../common/utils';

const { remote } = require('electron');

const { i18n } = remote.require('./app');

const SettingsFactory = ({ subCategory }) => {
  const settingsDOM = [];
  Object.keys(subCategory.settingObjs).forEach((settingKey, settingIndex) => {
    const { addon } = subCategory.settingObjs[settingKey];
    settingsDOM.push(
      <div className="control-item" id={settingKey} key={settingIndex}>
        {addon && (
          <Setting
            settingObj={addon}
            defaultType={addon.type}
            stateVar={convertToCamelCase(addon.title)}
            stateFunction={`set${convertToCamelCase(addon.title, true)}`}
          />
        )}
        <span>{i18n.t(`SETTINGS.${subCategory.settingObjs[settingKey].title}`)}</span>
        {subCategory.settingObjs[settingKey].notes && (
          <span className="notes">
            {i18n.t(`SETTINGS.${subCategory.settingObjs[settingKey].notes}`)}
          </span>
        )}
        {subCategory.settingObjs[settingKey].type === 'range' && (
          <span className="notes">
            {`(Default: ${subCategory.settingObjs[settingKey].initialValue})`}
          </span>
        )}
        <Setting
          settingObj={subCategory.settingObjs[settingKey]}
          defaultType={subCategory.type}
          stateVar={convertToCamelCase(settingKey)}
          stateFunction={`set${convertToCamelCase(settingKey, true)}`}
          settingKey={settingKey}
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
