import React from 'react';
import PropTypes from 'prop-types';
import { useStoreActions, useStoreState } from 'easy-peasy';

import Setting from './Setting';
import { convertToCamelCase } from '../../common/utils';

const remote = require('@electron/remote');

const { store, i18n } = remote.require('./app');

const SettingsFactory = ({ subCategory }) => {
  const settingsDOM = [];
  const userSettings = useStoreState((state) => state.userSettings);

  Object.keys(subCategory.settingObjs).forEach((settingKey, settingIndex) => {
    const { addonObj, addon, condition, conditionValue } = subCategory.settingObjs[settingKey];

    if (condition) {
      if (userSettings[convertToCamelCase(condition)] !== conditionValue) {
        return;
      }
    }

    const addonMarkup = [];

    if (addon) {
      addonObj.forEach((add, index) => {
        addonMarkup.push(
          <Setting
            settingObj={add}
            stateVar={convertToCamelCase(addon[index])}
            stateFunction={`set${convertToCamelCase(addon[index], true)}`}
          />,
        );
      });
    }

    settingsDOM.push(
      <div className="control-item" id={settingKey} key={settingIndex}>
        {/* 1. Push the Addon first */}
        {addon && addonMarkup}

        {/* 2. Then add title */}
        <span>
          {subCategory.settingObjs[settingKey].title &&
            i18n.t(`SETTINGS.${subCategory.settingObjs[settingKey].title}`)}
        </span>

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
  const resetFontSizes = useStoreActions((actions) => actions.userSettings.resetFontSizes);
  const categoriesDOM = [];
  Object.keys(category.subCatObjs).forEach((subCat, scIndex) => {
    categoriesDOM.push(
      <div key={`control-${scIndex}`} className={`controls-container`} id={`settings-${subCat}`}>
        <h4>{i18n.t(`SETTINGS.${category.subCatObjs[subCat].title}`)}</h4>
        <SettingsFactory subCategory={category.subCatObjs[subCat]} />
        {/* Renders 'Reset Font Sizes' button for 'font-sizes' subcategory. Clicking it calls resetFontSizes to revert font sizes to defaults. */}
        {subCat === 'font-sizes' && (
          <button onClick={resetFontSizes} key="reset-font-sizes">
            {i18n.t('Reset Font Sizes')}
          </button>
        )}
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
