import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

import Categories from './Categories';
import RecordingSettings from './RecordingSettings';

const SettingsContainer = ({ settingsObj }) => {
  const { dataRecording } = useStoreState((state) => state.userSettings);
  const settingsList = [];
  Object.keys(settingsObj).forEach((cat, index) => {
    const category = settingsObj[cat];
    if (category.type === 'title') {
      settingsList.push(
        <div className="settings-container" id={cat} key={`settings-container-${index}`}>
          <Categories category={category} />
        </div>,
      );
      if (cat === 'bani-and-languages' && dataRecording === true) {
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
