import React from 'react';
import PropTypes from 'prop-types';

import Categories from './Categories';

const SettingsContainer = ({ settingsObj }) => {
  const settingsList = [];
  Object.keys(settingsObj).forEach((cat, index) => {
    const category = settingsObj[cat];
    if (category.type === 'title') {
      settingsList.push(
        <div className="settings-container" id={cat} key={`settings-container-${index}`}>
          <Categories category={category} />
        </div>,
      );
    }
  });
  return <> {settingsList} </>;
};

SettingsContainer.propTypes = {
  settingsObj: PropTypes.object,
};

export default SettingsContainer;
