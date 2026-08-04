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
    isMiscSlide,
    verseSelectionNonce,
    historyOrder,
    singleDisplayActiveTab,
    pane1,
    pane2,
    pane3,
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
    setIsMiscSlide,
    setVerseSelectionNonce,
    setSingleDisplayActiveTab,
    setPane1,
    setPane2,
    setPane3,
    setVerseHistory,
  } = useStoreActions((state) => state.navigator);

  const { currentWorkspace, defaultPaneId } = useStoreState((state) => state.userSettings);

  const deleteFromHistory = (element, event) => {
    event.stopPropagation();
    const updatedHistory = verseHistory.filter(
      (historyItem) => historyItem.shabadId !== element.shabadId,
    );
    setVerseHistory(updatedHistory);
  };

  const openShabadFromHistory = (element) => {
    // The viewer renders nothing but the misc slide while this is set, so leaving
    // it would silently swallow the click. Every other route into the viewer
    // clears it; this one never did.
    if (isMiscSlide) {
      setIsMiscSlide(false);
    }
    // Picking the entry you are already reading must still count as a selection,
    // which `activeVerseId` alone cannot express. See `ShabadText`.
    setVerseSelectionNonce(verseSelectionNonce + 1);

    const currentPane = paneId || defaultPaneId;
    switch (currentPane) {
      case 1:
        setPane1({
          ...pane1,
          content: i18n.t('MULTI_PANE.SHABAD'),
          activeShabad: element.shabadId,
          activeVerse: element.continueFrom,
          baniType: element.type,
          versesRead: element.versesRead,
          homeVerse: element.homeVerse,
        });
        break;
      case 2:
        setPane2({
          ...pane2,
          content: i18n.t('MULTI_PANE.SHABAD'),
          activeShabad: element.shabadId,
          activeVerse: element.continueFrom,
          baniType: element.type,
          versesRead: element.versesRead,
          homeVerse: element.homeVerse,
        });
        break;
      case 3:
        setPane3({
          ...pane3,
          content: i18n.t('MULTI_PANE.SHABAD'),
          activeShabad: element.shabadId,
          activeVerse: element.continueFrom,
          baniType: element.type,
          versesRead: element.versesRead,
          homeVerse: element.homeVerse,
        });
        break;
      default:
        break;
    }
    if (currentWorkspace !== i18n.t('WORKSPACES.MULTI_PANE')) {
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
    }
  };

  const versesMarkup = [];

  verseHistory.forEach((element) => {
    versesMarkup.push(
      <div className="history-item-container" key={`history-${element.shabadId}`}>
        <div
          className="history-item-text"
          onClick={() => {
            openShabadFromHistory(element);
          }}
        >
          <p className="history-item gurmukhi">{element.label}</p>
        </div>
        <div className="history-item-options">
          <button
            onClick={(e) => {
              deleteFromHistory(element, e);
            }}
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>,
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
