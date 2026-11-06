import React from 'react';
import PropTypes from 'prop-types';

import Categories from './Categories';
import RecordingSettings from './RecordingSettings';

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
      if (cat === 'bani-and-languages') {
        settingsList.push(<RecordingSettings key="recording-settings" />);
      }
    }
  });
  return <> {settingsList} </>;
};

SettingsContainer.propTypes = {
  settingsObj: PropTypes.object,
};

export default SettingsContainer;
