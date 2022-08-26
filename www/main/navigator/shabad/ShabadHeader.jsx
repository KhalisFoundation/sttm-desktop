import React, { useEffect, useState } from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

const electron = require('electron');

const { ipcRenderer } = electron;
const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const ShabadHeader = () => {
  const [showViewer, setShowViewer] = useState(true);
  const { activeShabadId, activeVerseId, isDontSaveHistory } = useStoreState(
    state => state.navigator,
  );
  const { setActiveShabadId, setActiveVerseId, setIsDontSaveHistory } = useStoreActions(
    state => state.navigator,
  );

  const navigateVerseLeft = () => {
    if (activeShabadId) {
      if (!isDontSaveHistory) {
        setIsDontSaveHistory(true);
      }
      setActiveShabadId(activeShabadId - 1);
      if (activeVerseId !== null) {
        setActiveVerseId(null);
      }
    }
  };
  const navigateVerseRight = () => {
    if (activeShabadId) {
      if (!isDontSaveHistory) {
        setIsDontSaveHistory(true);
      }
      setActiveShabadId(activeShabadId + 1);
      if (activeVerseId !== null) {
        setActiveVerseId(null);
      }
    }
  };

  useEffect(() => {
    ipcRenderer.send('toggle-viewer-window', showViewer);
  }, [showViewer]);

  return (
    <div className="shabad-pane-header">
      <button
        className={`button toggle-viewer-btn ${!showViewer ? 'btn-danger' : ''}`.trim()}
        onClick={() => setShowViewer(!showViewer)}
        title={showViewer ? i18n.t('SHABAD_PANE.HIDE_BUTTON_TOOLTIP') : ''}
      >
        {showViewer ? i18n.t('SHABAD_PANE.HIDE_SCREEN') : i18n.t('SHABAD_PANE.SHOW_DISPLAY')}
      </button>
      <i className="fa fa-arrow-circle-o-left" onClick={navigateVerseLeft}></i>
      <i className="fa fa-arrow-circle-o-right" onClick={navigateVerseRight}></i>
    </div>
  );
};

export default ShabadHeader;
