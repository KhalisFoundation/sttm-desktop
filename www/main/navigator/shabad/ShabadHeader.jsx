import React, { useEffect, useRef, useState } from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

const electron = require('electron');

const { ipcRenderer } = electron;
const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const ShabadHeader = () => {
  const [showViewer, setShowViewer] = useState(true);
  const favBtnRef = useRef(null);
  const { activeShabadId, activeVerseId, isDontSaveHistory, favShabad, searchVerse } =
    useStoreState((state) => state.navigator);
  const { setActiveShabadId, setActiveVerseId, setIsDontSaveHistory, setFavShabad } =
    useStoreActions((state) => state.navigator);
  const favShabadIndex = favShabad.findIndex((element) => element.shabadId === activeShabadId);

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
      {activeShabadId && (
        <button
          className={favShabadIndex < 0 ? 'button fav-btn' : 'button fav-btn unfav-btn'}
          ref={favBtnRef}
          onClick={() => {
            if (favShabadIndex < 0) {
              const shabadObj = {
                text: searchVerse,
                shabadId: activeShabadId,
                verseId: activeVerseId,
              };
              setFavShabad([shabadObj, ...favShabad]);
            } else {
              favShabad.splice(favShabadIndex, 1);
              setFavShabad([...favShabad]);
            }
          }}
        >
          <i className="fa fa-heart"></i>
          {favShabadIndex < 0 ? i18n.t('SHABAD_PANE.MARK_FAV') : i18n.t('SHABAD_PANE.UNMARK_FAV')}
        </button>
      )}
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
