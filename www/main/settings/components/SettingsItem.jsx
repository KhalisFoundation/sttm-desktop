import React from 'react';
import PropTypes from 'prop-types';

const SettingsItem = ({ settingsObj }) => {
  console.log('obj goes here');
  console.log(settingsObj);

  return <p>category</p>;
};

SettingsItem.propTypes = {
  settingsObj: PropTypes.object,
};

export default SettingsItem;
