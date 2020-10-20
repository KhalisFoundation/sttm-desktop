import React from 'react';
import PropTypes from 'prop-types';

import { Overlay } from '../../common/sttm-ui';
import { SettingsItem } from './SettingsItem';

const settingsJson = require('../../../configs/settings.json');

const Settings = ({ onScreenClose }) => {
  const settingCategories = Object.keys(settingsJson);
  const items = settingCategories.map((category, index) => {
    return <SettingsItem key={'settings' + index} settingsObj={settingsJson[category]} />;
  });

  return (
    <Overlay onScreenClose={onScreenClose}>
      <div id="settings-wrapper"> {items} </div>
    </Overlay>
  );
};

Settings.propTypes = {
  onScreenClose: PropTypes.func,
};

export default Settings;
