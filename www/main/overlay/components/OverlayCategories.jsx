import React from 'react';
import PropTypes from 'prop-types';

import OverlaySetting from './OverlaySetting';
import { convertToCamelCase } from '../../common/utils';
import { i18n } from '../../common/i18n';

const OverlayCategories = ({ category }) =>
  Object.keys(category.subCatObjs).map((subCat) => {
    const { title, settingObjs } = category.subCatObjs[subCat];
    return (
      <div key={subCat} className="overlay-subcategory" id={`settings-${subCat}`}>
        {title && <p className="overlay-subcategory-title">{i18n.t(`BANI_OVERLAY.${title}`)}</p>}
        {Object.keys(settingObjs).map((settingKey) => (
          <OverlaySetting
            key={settingKey}
            settingKey={settingKey}
            settingObj={settingObjs[settingKey]}
            stateVar={convertToCamelCase(settingKey)}
            stateFunction={`set${convertToCamelCase(settingKey, true)}`}
          />
        ))}
      </div>
    );
  });

OverlayCategories.propTypes = {
  category: PropTypes.object,
};

export default OverlayCategories;
