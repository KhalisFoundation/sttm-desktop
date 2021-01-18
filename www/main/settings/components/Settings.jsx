import React from 'react';
import PropTypes from 'prop-types';

import { Overlay } from '../../common/sttm-ui';

import SettingsNav from './SettingsNav';
import SettingsContainer from './SettingsContainer';
import ThemeContainer from './ThemeContainer';
import { settingsNavObj, settingsObj } from '../utils';

const Settings = ({ onScreenClose }) => {
  return (
    <Overlay onScreenClose={onScreenClose}>
      <div className="settings-wrapper">
        <SettingsNav settingsNavObj={settingsNavObj} />
        <SettingsContainer settingsObj={settingsObj} />
        <ThemeContainer />
      </div>
    </Overlay>
  );
};

Settings.propTypes = {
  onScreenClose: PropTypes.func,
};

export default Settings;
