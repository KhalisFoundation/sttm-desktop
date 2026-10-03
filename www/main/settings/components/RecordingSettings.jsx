import React, { useEffect, useState } from 'react';
import { ipcRenderer } from 'electron';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const RecordingSettings = () => {
  const [gurdwaraName, setGurdwaraName] = useState('');
  const [hfTokenKhalis, setHfTokenKhalis] = useState('');
  const [showToken, setShowToken] = useState(false);

  const save = (next) => {
    ipcRenderer.invoke('save-recording-settings', next);
  };

  useEffect(() => {
    ipcRenderer.invoke('get-recording-settings').then((prefs) => {
      setGurdwaraName(prefs.gurdwaraName || '');
      setHfTokenKhalis(prefs.hfTokenKhalis || '');
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
              const value = e.target.value;
              setGurdwaraName(value);
              save({ gurdwaraName: value, hfTokenKhalis });
            }}
          />
        </div>
        <div className="control-item">
          <span>HF token</span>
          <span className="token-field">
            <input
              className="disable-kb-shortcuts"
              type={showToken ? 'text' : 'password'}
              value={hfTokenKhalis}
              onChange={(e) => {
                const value = e.target.value;
                setHfTokenKhalis(value);
                save({ gurdwaraName, hfTokenKhalis: value });
              }}
            />
            <button
              type="button"
              className={showToken ? 'token-eye on' : 'token-eye'}
              aria-label={showToken ? 'Hide token' : 'Show token'}
              onClick={() => setShowToken((shown) => !shown)}
            />
          </span>
        </div>
      </div>
    </div>
  );
};

export default RecordingSettings;
