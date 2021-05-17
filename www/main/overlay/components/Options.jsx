import React from 'react';
import PropTypes from 'prop-types';

import OverlaySettingsContainer from './OverlaySettingsContainer';

const OverlaySettings = ({ settingsObj }) => {
  return (
    <div className="overlay-settings-wrapper">
      <OverlaySettingsContainer settingsObj={settingsObj} />
    </div>
  );
};

OverlaySettings.propTypes = {
  settingsObj: PropTypes.object,
};

export default OverlaySettings;
