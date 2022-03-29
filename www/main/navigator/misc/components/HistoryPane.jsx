import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useStoreState, useStoreActions } from 'easy-peasy';

export const HistoryPane = ({ className }) => {
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
    singleDisplayActiveTab,
  } = useStoreState(state => state.navigator);
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
  } = useStoreActions(state => state.navigator);
  const { isSingleDisplayMode } = useStoreState(state => state.userSettings);
  const shortcutsState = localStorage.getItem('isShortcutsOpen');
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(shortcutsState);

  const openShabadFromHistory = element => {
    if (singleDisplayActiveTab !== 'shabad') {
      setSingleDisplayActiveTab('shabad');
    }
    if (element.continueFrom !== initialVerseId) {
      setInitialVerseId(element.continueFrom);
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
      if (element.verseId !== activeVerseId) {
        setActiveVerseId(element.verseId);
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
  };

  const versesMarkup = [];

  verseHistory.forEach(element => {
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

  useEffect(() => {
    document.addEventListener(
      'openShortcut',
      e => {
        setIsShortcutsOpen(e.detail.value);
      },
      false,
    );
    return () => {
      document.removeEventListener('openShortcut', e => {
        setIsShortcutsOpen(e.detail.value);
      });
    };
  });

  return (
    <div
      className={`history-results ${
        isShortcutsOpen && !isSingleDisplayMode ? 'history-results-shrinked' : ''
      } ${className}`}
    >
      {versesMarkup}
    </div>
  );
};

HistoryPane.propTypes = {
  className: PropTypes.string,
};
