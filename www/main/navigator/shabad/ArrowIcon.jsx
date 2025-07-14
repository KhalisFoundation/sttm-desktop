import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState, useStoreActions } from 'easy-peasy';
import banidb from '../../banidb';

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

  const loadShabadAndSetVerses = (shabadId, setPane, currentPane, targetPaneId) =>
    banidb
      .loadShabad(shabadId)
      .then((verses) => {
        if (verses && verses.length > 0) {
          const firstVerseId = verses[0].ID;
          if (initialVerseId !== firstVerseId) setInitialVerseId(firstVerseId);
          if (activeVerseId !== firstVerseId) setActiveVerseId(firstVerseId);

          if (setPane && currentPane) {
            setPane({
              ...currentPane,
              content: i18n.t('MULTI_PANE.SHABAD'),
              activeShabad: shabadId,
              baniType: 'shabad',
              versesRead: [firstVerseId],
              activeVerse: firstVerseId,
            });
            if (targetPaneId !== activePaneId) setActivePaneId(targetPaneId);
          }

          return firstVerseId;
        }
        return null;
      })
      .catch((error) => {
        console.error('Error loading shabad:', error);
        return null;
      });

  const updatePaneShabad = (direction) => {
    let currentShabad;
    switch (paneId) {
      case 1:
        currentShabad =
          direction === 'left'
            ? parseInt(pane1.activeShabad, 10) - 1
            : parseInt(pane1.activeShabad, 10) + 1;
        loadShabadAndSetVerses(currentShabad, setPane1, pane1, paneId);
        break;
      case 2:
        currentShabad =
          direction === 'left'
            ? parseInt(pane2.activeShabad, 10) - 1
            : parseInt(pane2.activeShabad, 10) + 1;
        loadShabadAndSetVerses(currentShabad, setPane2, pane2, paneId);
        break;
      case 3:
        currentShabad =
          direction === 'left'
            ? parseInt(pane3.activeShabad, 10) - 1
            : parseInt(pane3.activeShabad, 10) + 1;
        loadShabadAndSetVerses(currentShabad, setPane3, pane3, paneId);
        break;
      default:
        break;
    }
  };

  const navigateVerseLeft = () => {
    if (currentWorkspace === i18n.t('WORKSPACES.MULTI_PANE')) {
      updatePaneShabad('left');
    } else if (activeShabadId) {
      const newShabadId = activeShabadId - 1;
      setActiveShabadId(newShabadId);
      loadShabadAndSetVerses(newShabadId);
      if (homeVerse !== 0) {
        setHomeVerse(0);
      }
    }
  };

  const navigateVerseRight = () => {
    if (currentWorkspace === i18n.t('WORKSPACES.MULTI_PANE')) {
      updatePaneShabad('right');
    } else if (activeShabadId) {
      const newShabadId = activeShabadId + 1;
      setActiveShabadId(newShabadId);
      loadShabadAndSetVerses(newShabadId);
      if (homeVerse !== 0) {
        setHomeVerse(0);
      }
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
