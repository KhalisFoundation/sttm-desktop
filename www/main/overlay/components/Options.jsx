import React from 'react';
import PropTypes from 'prop-types';

import OverlaySettingsContainer from './OverlaySettingsContainer';

const OverlaySettings = ({ settingsObj }) => (
  <div className="overlay-settings-wrapper">
    <OverlaySettingsContainer settingsObj={settingsObj} />
  </div>
);

OverlaySettings.propTypes = {
  settingsObj: PropTypes.object,
};

export default OverlaySettings;
