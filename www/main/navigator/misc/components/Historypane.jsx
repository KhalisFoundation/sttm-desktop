import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

function Historypane() {
  const { verseHistory } = useStoreState(state => state.navigator);
  const { setActiveShabadId, setInitialVerseId, setVersesRead } = useStoreActions(
    state => state.navigator,
  );

  const versesMarkup = [];

  verseHistory.forEach(element => {
    versesMarkup.push(
      <p
        className="history-item gurmukhi"
        key={`history-${element.shabadId}`}
        onClick={() => {
          setActiveShabadId(element.shabadId);
          setInitialVerseId(element.continueFrom);
          setVersesRead(element.versesRead);
        }}
      >
        {element.label}
      </p>,
    );
  });

  return <div className="history-results">{versesMarkup}</div>;
}

export default Historypane;
