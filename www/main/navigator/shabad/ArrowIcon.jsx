import React, { useEffect } from 'react';
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
    pane1,
    pane2,
    pane3,
    shortcuts,
  } = useStoreState((state) => state.navigator);

  const { currentWorkspace } = useStoreState((state) => state.userSettings);

  const {
    setInitialVerseId,
    setActiveVerseId,
    setActivePaneId,
    setActiveShabadId,
    setPane1,
    setPane2,
    setPane3,
    setShortcuts,
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
    if (currentWorkspace !== i18n.t('WORKSPACES.MULTI_PANE') && activeShabadId !== currentShabad) {
      setActiveShabadId(currentShabad);
    }
  };

  const navigateVerseLeft = () => {
    updatePaneShabad('left');
  };

  const navigateVerseRight = () => {
    updatePaneShabad('right');
  };

  useEffect(() => {
    if (shortcuts.nextShabad) {
      updatePaneShabad('right');
      setShortcuts({
        ...shortcuts,
        nextShabad: false,
      });
    } else if (shortcuts.prevShabad) {
      updatePaneShabad('left');
      setShortcuts({
        ...shortcuts,
        prevShabad: false,
      });
    }
  }, [shortcuts]);

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
