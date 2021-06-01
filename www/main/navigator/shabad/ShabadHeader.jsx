import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

function ShabadHeader() {
  const { activeShabadId, noActiveVerse } = useStoreState(state => state.navigator);
  const { setActiveShabadId, setNoActiveVerse } = useStoreActions(state => state.navigator);

  const navigateVerseLeft = () => {
    setActiveShabadId(activeShabadId - 1);
    if (!noActiveVerse) {
      setNoActiveVerse(true);
    }
  };
  const navigateVerseRight = () => {
    setActiveShabadId(activeShabadId + 1);
    if (!noActiveVerse) {
      setNoActiveVerse(true);
    }
  };

  return (
    <>
      <i className="fa fa-arrow-circle-o-left" onClick={navigateVerseLeft}></i>
      <i className="fa fa-arrow-circle-o-right" onClick={navigateVerseRight}></i>
    </>
  );
}

export default ShabadHeader;
