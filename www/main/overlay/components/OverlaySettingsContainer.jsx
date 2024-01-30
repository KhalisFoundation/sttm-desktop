import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

import OverlayCategories from './OverlayCategories';
import { Switch } from '../../common/sttm-ui';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const OverlaySettingsContainer = ({ settingsObj }) => {
  const baniOverlayState = useStoreState((state) => state.baniOverlay);
  const settingsList = [];
  const showAdvancedOptions = ['top', 'bottom'].includes(baniOverlayState.layout);
  Object.keys(settingsObj).forEach((cat, index) => {
    const category = settingsObj[cat];
    if (category.type === 'title') {
      settingsList.push(
        <div
          id={cat}
          className={`overlay-settings-container ${
            cat === 'advanced-options' && !showAdvancedOptions && 'hide-category'
          }`}
          key={`overlay-settings-container-${index}`}
        >
          <div className="category-header">
            {category.title && (
              <p className="overlay-window-text"> {i18n.t(`BANI_OVERLAY.${category.title}`)} </p>
            )}

            {category.toggle && (
              <Switch
                controlId={`subcat-switch`}
                className={`control-item-switch`}
                value={false}
                onToggle={() => {
                  // Add logic for switch toggle here
                }}
              />
            )}
          </div>
          <OverlayCategories category={category} />
        </div>,
      );
    }
  });
  return <> {settingsList} </>;
};

OverlaySettingsContainer.propTypes = {
  settingsObj: PropTypes.object,
};

export default OverlaySettingsContainer;
