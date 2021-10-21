import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

export const HistoryPane = () => {
  const {
    verseHistory,
    activeShabadId,
    initialVerseId,
    versesRead,
    isCeremonyBani,
    isSundarGutkaBani,
  } = useStoreState(state => state.navigator);
  const {
    setActiveShabadId,
    setInitialVerseId,
    setVersesRead,
    setIsCeremonyBani,
    setIsSundarGutkaBani,
  } = useStoreActions(state => state.navigator);

  const openShabadFromHistory = element => {
    if (element.shabadId !== activeShabadId) {
      setActiveShabadId(element.shabadId);
    }
    if (element.continueFrom !== initialVerseId) {
      setInitialVerseId(element.continueFrom);
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
    }
    if (element.type === 'ceremony') {
      if (isSundarGutkaBani) {
        setIsSundarGutkaBani(false);
      }
    }
    if (element.type === 'bani') {
      if (isCeremonyBani) {
        setIsCeremonyBani(false);
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

  return <div className="history-results">{versesMarkup}</div>;
};
