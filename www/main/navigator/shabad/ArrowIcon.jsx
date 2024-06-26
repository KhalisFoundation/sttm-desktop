import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState, useStoreActions } from 'easy-peasy';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const ArrowIcon = ({ paneId }) => {
  const {
    isSundarGutkaBani,
    activeShabadId,
    initialVerseId,
    isCeremonyBani,
    activeVerseId,
    activePaneId,
    homeVerse,
    pane1,
    pane2,
    pane3,
  } = useStoreState((state) => state.navigator);

  const { currentWorkspace } = useStoreState((state) => state.userSettings);

  const {
    setActiveShabadId,
    setInitialVerseId,
    setActiveVerseId,
    setActivePaneId,
    setHomeVerse,
    setPane1,
    setPane2,
    setPane3,
  } = useStoreActions((state) => state.navigator);

  const paneBani = {
    1: pane1.baniType,
    2: pane2.baniType,
    3: pane3.baniType,
  };

  const updatePaneShabad = (direction) => {
    if (paneId !== activePaneId) setActivePaneId(paneId);
    let currentShabad;
    switch (paneId) {
      case 1:
        currentShabad =
          direction === 'left'
            ? parseInt(pane1.activeShabad, 10) - 1
            : parseInt(pane1.activeShabad, 10) + 1;
        setPane1({
          ...pane1,
          content: i18n.t('MULTI_PANE.SHABAD'),
          activeShabad: currentShabad,
          baniType: 'shabad',
          versesRead: [],
          activeVerse: null,
        });
        break;
      case 2:
        currentShabad =
          direction === 'left'
            ? parseInt(pane2.activeShabad, 10) - 1
            : parseInt(pane2.activeShabad, 10) + 1;
        setPane2({
          ...pane2,
          content: i18n.t('MULTI_PANE.SHABAD'),
          activeShabad: currentShabad,
          baniType: 'shabad',
          versesRead: [],
          activeVerse: null,
        });
        break;
      case 3:
        currentShabad =
          direction === 'left'
            ? parseInt(pane3.activeShabad, 10) - 1
            : parseInt(pane3.activeShabad, 10) + 1;
        setPane3({
          ...pane3,
          content: i18n.t('MULTI_PANE.SHABAD'),
          activeShabad: currentShabad,
          baniType: 'shabad',
          versesRead: [],
          activeVerse: null,
        });
        break;
      default:
        break;
    }
  };

  const navigateVerseLeft = () => {
    if (currentWorkspace === i18n.t('WORKSPACES.MULTI_PANE')) {
      updatePaneShabad('left');
    } else if (activeShabadId) {
      setActiveShabadId(activeShabadId - 1);
      if (activeVerseId !== null) {
        setActiveVerseId(null);
      }
      if (homeVerse !== 0) {
        setHomeVerse(0);
      }
    }

    if (initialVerseId !== null) {
      setInitialVerseId(null);
    }
  };

  const navigateVerseRight = () => {
    if (currentWorkspace === i18n.t('WORKSPACES.MULTI_PANE')) {
      updatePaneShabad('right');
    } else if (activeShabadId) {
      setActiveShabadId(activeShabadId + 1);
      if (activeVerseId !== null) {
        setActiveVerseId(null);
      }
      if (homeVerse !== 0) {
        setHomeVerse(0);
      }
    }

    if (initialVerseId !== null) {
      setInitialVerseId(null);
    }
  };

  if (currentWorkspace === i18n.t('WORKSPACES.MULTI_PANE')) {
    if (paneBani[paneId] === 'shabad') {
      return (
        <div className="arrow-icons">
          <i className="fa fa-arrow-circle-o-left" onClick={navigateVerseLeft}></i>
          <i className="fa fa-arrow-circle-o-right" onClick={navigateVerseRight}></i>
        </div>
      );
    }
  } else if (activeShabadId && !isSundarGutkaBani && !isCeremonyBani) {
    return (
      <>
        <i className="fa fa-arrow-circle-o-left" onClick={navigateVerseLeft}></i>
        <i className="fa fa-arrow-circle-o-right" onClick={navigateVerseRight}></i>
      </>
    );
  }
  return null;
};

ArrowIcon.propTypes = {
  paneId: PropTypes.number,
};

export default ArrowIcon;
