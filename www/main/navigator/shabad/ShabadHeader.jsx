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
  const {
    activeShabadId,
    activeVerseId,
    favShabad,
    initialVerseId,
    homeVerse,
    isSundarGutkaBani,
    isCeremonyBani,
  } = useStoreState((state) => state.navigator);
  const { setActiveShabadId, setActiveVerseId, setInitialVerseId, setFavShabad, setHomeVerse } =
    useStoreActions((state) => state.navigator);

  const { userToken } = useStoreState((state) => state.app);
  const favShabadIndex = favShabad.findIndex((element) => element.shabad_id === activeShabadId);

  const navigateVerseLeft = () => {
    if (activeShabadId) {
      setActiveShabadId(activeShabadId - 1);
      if (activeVerseId !== null) {
        setActiveVerseId(null);
      }
      if (initialVerseId !== null) {
        setInitialVerseId(null);
      }
      if (homeVerse !== 0) {
        setHomeVerse(0);
      }
    }
  };
  const navigateVerseRight = () => {
    if (activeShabadId) {
      setActiveShabadId(activeShabadId + 1);
      if (activeVerseId !== null) {
        setActiveVerseId(null);
      }
      if (initialVerseId !== null) {
        setInitialVerseId(null);
      }
      if (homeVerse !== 0) {
        setHomeVerse(0);
      }
    }
  };

  const toggleFavShabad = () => {
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
  };

  useEffect(() => {
    ipcRenderer.send('toggle-viewer-window', showViewer);
  }, [showViewer]);

  return (
    <div className="shabad-pane-header">
      {activeShabadId && !isLoading && userToken && (
        <button
          className={classNames('fav-btn', favShabadIndex >= 0 && 'unfav-btn')}
          ref={favBtnRef}
          title={i18n.t('SHABAD_PANE.FAV_BTN_TOOLTIP')}
          onClick={toggleFavShabad}
        >
          <i className={favShabadIndex < 0 ? 'fa-regular fa-star' : 'fa-solid fa-star'}></i>
        </button>
      )}
      <button
        className={classNames('button toggle-viewer-btn', !showViewer && 'btn-danger')}
        onClick={() => setShowViewer(!showViewer)}
        title={showViewer ? i18n.t('SHABAD_PANE.HIDE_BUTTON_TOOLTIP') : ''}
      >
        {showViewer ? (
          <>
            <img src="assets/img/icons/monitor-slash.png" />
            <p>{i18n.t('SHABAD_PANE.HIDE_SCREEN')}</p>
          </>
        ) : (
          <>
            <img src="assets/img/icons/monitor.png" />
            <p>{i18n.t('SHABAD_PANE.SHOW_DISPLAY')}</p>
          </>
        )}
      </button>
      {!isSundarGutkaBani && !isCeremonyBani && (
        <>
          <i className="fa fa-arrow-circle-o-left" onClick={navigateVerseLeft}></i>
          <i className="fa fa-arrow-circle-o-right" onClick={navigateVerseRight}></i>
        </>
      )}
    </div>
  );
};

export default ShabadHeader;
