import React, { useEffect, useRef, useState } from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';
import classNames from '../../common/utils/classnames';
import { addToFav, fetchFavShabad, removeFromFav } from '../misc/utils';

const electron = require('electron');

const { ipcRenderer } = electron;
const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const ShabadHeader = () => {
  const [showViewer, setShowViewer] = useState(true);
  const [isLoading, setLoading] = useState(false);
  const favBtnRef = useRef(null);
  const { activeShabadId, activeVerseId, isDontSaveHistory, favShabad, homeVerse } = useStoreState(
    (state) => state.navigator,
  );
  const { setActiveShabadId, setActiveVerseId, setIsDontSaveHistory, setFavShabad, setHomeVerse } =
    useStoreActions((state) => state.navigator);

  const { userToken } = useStoreState((state) => state.app);
  const favShabadIndex = favShabad.findIndex((element) => element.shabad_id === activeShabadId);

  const navigateVerseLeft = () => {
    if (activeShabadId) {
      if (!isDontSaveHistory) {
        setIsDontSaveHistory(true);
      }
      setActiveShabadId(activeShabadId - 1);
      if (activeVerseId !== null) {
        setActiveVerseId(null);
      }
      if (homeVerse !== 0) {
        setHomeVerse(0);
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
      if (homeVerse !== 0) {
        setHomeVerse(0);
      }
    }
  };

  useEffect(() => {
    ipcRenderer.send('toggle-viewer-window', showViewer);
  }, [showViewer]);

  return (
    <div className="shabad-pane-header">
      {activeShabadId && !isLoading && userToken && (
        <button
          className={classNames('button fav-btn', favShabadIndex >= 0 && 'unfav-btn')}
          ref={favBtnRef}
          title={i18n.t('SHABAD_PANE.FAV_BTN_TOOLTIP')}
          onClick={() => {
            if (favShabadIndex < 0) {
              addToFav(activeShabadId, activeVerseId, userToken);
            } else {
              favShabad.splice(favShabadIndex, 1);
              removeFromFav(activeShabadId, userToken);
              setFavShabad([...favShabad]);
            }
            const fetchProgress = fetchFavShabad(userToken);
            setLoading(true);
            fetchProgress.then((data) => {
              setFavShabad([...data]);
              setLoading(false);
            });
          }}
        >
          <i className={favShabadIndex < 0 ? 'fa-solid fa-star' : 'fa-regular fa-star'}></i>
          {favShabadIndex < 0 ? i18n.t('SHABAD_PANE.MARK_FAV') : i18n.t('SHABAD_PANE.UNMARK_FAV')}
        </button>
      )}
      <button
        className={classNames('button toggle-viewer-btn', !showViewer && 'btn-danger')}
        onClick={() => setShowViewer(!showViewer)}
        title={showViewer ? i18n.t('SHABAD_PANE.HIDE_BUTTON_TOOLTIP') : ''}
      >
        <i className="fa fa-display"></i>
        {showViewer ? i18n.t('SHABAD_PANE.HIDE_SCREEN') : i18n.t('SHABAD_PANE.SHOW_DISPLAY')}
      </button>
      <i className="fa fa-arrow-circle-o-left" onClick={navigateVerseLeft}></i>
      <i className="fa fa-arrow-circle-o-right" onClick={navigateVerseRight}></i>
    </div>
  );
};

export default ShabadHeader;
