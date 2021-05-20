import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

function Historypane() {
  const navigatorState = useStoreState(state => state.navigator);
  const { setShabadSelected, setVerseSelected, setTraversedVerses } = useStoreActions(
    state => state.navigator,
  );

  const { versesHistory } = navigatorState;

  const versesMarkup = [];

  versesHistory.forEach(element => {
    versesMarkup.push(
      <p
        className="gurmukhi"
        key={`history-${element.shabadId}`}
        onClick={() => {
          setShabadSelected(element.shabadId);
          setVerseSelected(element.continueFrom);
          setTraversedVerses(element.versesRead);
        }}
      >
        {element.label}
      </p>,
    );
  });

  return <div className="history-results">{versesMarkup}</div>;
}

export default Historypane;
