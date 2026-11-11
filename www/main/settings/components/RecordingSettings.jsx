import React, { useEffect, useState } from 'react';
import { ipcRenderer } from 'electron';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const RecordingSettings = () => {
  const [gurdwaraName, setGurdwaraName] = useState('');

  const save = (next) => {
    ipcRenderer.invoke('save-recording-settings', next);
  };

  useEffect(() => {
    ipcRenderer.invoke('get-recording-settings').then((prefs) => {
      setGurdwaraName(prefs.gurdwaraName || '');
    });
  }, []);

  return (
    <div className="settings-container" id="recording-settings">
      <div className="controls-container">
        <h4>{i18n.t('SETTINGS.RECORDING_SETTINGS')}</h4>
        <div className="control-item">
          <span>Gurdwara name</span>
          <input
            className="disable-kb-shortcuts recording-field"
            value={gurdwaraName}
            onChange={(e) => {
              const { value } = e.target;
              setGurdwaraName(value);
              save({ gurdwaraName: value });
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default RecordingSettings;
