import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

function ShabadHeader() {
  const { activeShabadId, activeVerseId } = useStoreState(state => state.navigator);
  const { setActiveShabadId, setActiveVerseId } = useStoreActions(state => state.navigator);

  const navigateVerseLeft = () => {
    setActiveShabadId(activeShabadId - 1);
    if (activeVerseId !== null) {
      setActiveVerseId(null);
    }
  };
  const navigateVerseRight = () => {
    setActiveShabadId(activeShabadId + 1);
    if (activeVerseId !== null) {
      setActiveVerseId(null);
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
