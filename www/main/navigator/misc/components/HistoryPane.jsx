import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState, useStoreActions } from 'easy-peasy';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

export const HistoryPane = ({ className, paneId }) => {
  const {
    verseHistory,
    activeShabadId,
    initialVerseId,
    versesRead,
    isCeremonyBani,
    isSundarGutkaBani,
    ceremonyId,
    sundarGutkaBaniId,
    homeVerse,
    activeVerseId,
    historyOrder,
    singleDisplayActiveTab,
    pane1,
    pane2,
    pane3,
    activePaneId,
  } = useStoreState((state) => state.navigator);
  const {
    setActiveShabadId,
    setInitialVerseId,
    setVersesRead,
    setIsCeremonyBani,
    setIsSundarGutkaBani,
    setCeremonyId,
    setSundarGutkaBaniId,
    setHomeVerse,
    setActiveVerseId,
    setSingleDisplayActiveTab,
    setPane1,
    setPane2,
    setPane3,
    setActivePaneId,
  } = useStoreActions((state) => state.navigator);

  const { currentWorkspace } = useStoreState((state) => state.userSettings);

  const openShabadFromHistory = (element) => {
    if (singleDisplayActiveTab !== 'shabad') {
      setSingleDisplayActiveTab('shabad');
    }
    if (element.verseId !== initialVerseId) {
      setInitialVerseId(element.verseId);
    }
    if (element.homeVerse !== homeVerse) {
      setHomeVerse(element.homeVerse);
    }
    if (element.versesRead !== versesRead) {
      setVersesRead(element.versesRead);
    }
    if (element.type === 'shabad') {
      if (isSundarGutkaBani) {
        setIsSundarGutkaBani(false);
      }
      if (isCeremonyBani) {
        setIsCeremonyBani(false);
      }
      if (element.shabadId !== activeShabadId) {
        setActiveShabadId(element.shabadId);
      }
    }
    if (element.type === 'ceremony') {
      if (isSundarGutkaBani) {
        setIsSundarGutkaBani(false);
      }
      if (!isCeremonyBani) {
        setIsCeremonyBani(true);
      }
      if (ceremonyId !== element.shabadId) {
        setCeremonyId(element.shabadId);
      }
    }
    if (element.type === 'bani') {
      if (isCeremonyBani) {
        setIsCeremonyBani(false);
      }
      if (!isSundarGutkaBani) {
        setIsSundarGutkaBani(true);
      }

      if (sundarGutkaBaniId !== element.shabadId) {
        setSundarGutkaBaniId(element.shabadId);
      }
    }
    if (element.continueFrom !== activeVerseId) {
      setActiveVerseId(element.continueFrom);
    }
    if (currentWorkspace === i18n.t('WORKSPACES.MULTI_PANE')) {
      if (paneId !== activePaneId) setActivePaneId(paneId);
      switch (paneId) {
        case 1:
          setPane1({
            ...pane1,
            content: i18n.t('MULTI_PANE.SHABAD'),
            activeShabad: element.shabadId,
          });
          break;
        case 2:
          setPane2({
            ...pane2,
            content: i18n.t('MULTI_PANE.SHABAD'),
            activeShabad: element.shabadId,
          });
          break;
        case 3:
          setPane3({
            ...pane3,
            content: i18n.t('MULTI_PANE.SHABAD'),
            activeShabad: element.shabadId,
          });
          break;
        default:
          break;
      }
    }
  };

  const versesMarkup = [];

  verseHistory.forEach((element) => {
    versesMarkup.push(
      <p
        className="history-item gurmukhi"
        key={`history-${element.shabadId}`}
        onClick={() => {
          openShabadFromHistory(element);
        }}
      >
        {element.label}
      </p>,
    );
  });

  return (
    <div className={className}>
      <div className={`history-results ${className}`}>
        {historyOrder === 'newest' ? versesMarkup : versesMarkup.slice().reverse()}
      </div>
    </div>
  );
};

HistoryPane.propTypes = {
  className: PropTypes.string,
  paneId: PropTypes.number,
};
