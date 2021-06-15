import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

export const HistoryPane = () => {
  const { verseHistory, activeShabadId, initialVerseId, versesRead } = useStoreState(
    state => state.navigator,
  );
  const { setActiveShabadId, setInitialVerseId, setVersesRead } = useStoreActions(
    state => state.navigator,
  );

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
