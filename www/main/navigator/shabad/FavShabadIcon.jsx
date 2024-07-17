import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';

import { useStoreState, useStoreActions } from 'easy-peasy';
import classNames from '../../common/utils/classnames';
import { addToFav, fetchFavShabad, removeFromFav } from '../misc/utils';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const FavShabadIcon = ({ paneId }) => {
  const [isLoading, setLoading] = useState(false);
  const favBtnRef = useRef(null);
  const {
    activeShabadId,
    activeVerseId,
    favShabad,
    pane1,
    pane2,
    pane3,
    isSundarGutkaBani,
    isCeremonyBani,
  } = useStoreState((state) => state.navigator);
  const { currentWorkspace } = useStoreState((state) => state.userSettings);

  const { setFavShabad } = useStoreActions((state) => state.navigator);

  const { userToken } = useStoreState((state) => state.app);

  const [currentShabad, setCurrentShabad] = useState(activeShabadId);
  const [currentVerse, setCurrentVerse] = useState(activeVerseId);
  const [favShabadIndex, setFavShabadIndex] = useState(-1);
  const [baniType, setBaniType] = useState('');

  useEffect(() => {
    if (paneId) {
      switch (paneId) {
        case 1:
          setCurrentShabad(pane1.activeShabad);
          setCurrentVerse(pane1.activeVerse);
          setBaniType(pane1.baniType);
          break;
        case 2:
          setCurrentShabad(pane2.activeShabad);
          setCurrentVerse(pane2.activeVerse);
          setBaniType(pane2.baniType);
          break;
        case 3:
          setCurrentShabad(pane3.activeShabad);
          setCurrentVerse(pane3.activeVerse);
          setBaniType(pane3.baniType);
          break;
        default:
          break;
      }
    } else {
      setCurrentShabad(activeShabadId);
      setCurrentVerse(activeVerseId);
    }
  }, [pane1, pane2, pane3, activeShabadId, activeVerseId]);

  useEffect(() => {
    const index = favShabad.findIndex((element) => element.shabad_id === currentShabad);
    setFavShabadIndex(index);
  }, [favShabad, currentShabad]);

  const toggleFavShabad = () => {
    if (favShabadIndex < 0) {
      addToFav(currentShabad, currentVerse, userToken);
    } else {
      favShabad.splice(favShabadIndex, 1);
      removeFromFav(currentShabad, userToken);
      setFavShabad([...favShabad]);
    }
    const fetchProgress = fetchFavShabad(userToken);
    setLoading(true);
    fetchProgress.then((data) => {
      setFavShabad([...data]);
      setLoading(false);
    });
  };

  if (
    baniType === 'shabad' ||
    (currentWorkspace !== i18n.t('WORKSPACES.MULTI_PANE') && !isSundarGutkaBani && !isCeremonyBani)
  ) {
    if (currentShabad && !isLoading && userToken) {
      return (
        <button
          className={classNames('fav-btn', favShabadIndex >= 0 && 'unfav-btn')}
          ref={favBtnRef}
          title={i18n.t('SHABAD_PANE.FAV_BTN_TOOLTIP')}
          onClick={toggleFavShabad}
        >
          <i className={favShabadIndex < 0 ? 'fa-regular fa-star' : 'fa-solid fa-star'}></i>
        </button>
      );
    }
  }
  return null;
};

FavShabadIcon.propTypes = {
  paneId: PropTypes.number,
};

export default FavShabadIcon;
