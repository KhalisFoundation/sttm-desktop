import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

function ShabadHeader() {
  const { activeShabadId } = useStoreState(state => state.navigator);
  const { setActiveShabadId } = useStoreActions(state => state.navigator);

  const navigateVerseLeft = () => {
    setActiveShabadId(activeShabadId - 1);
  };
  const navigateVerseRight = () => {
    setActiveShabadId(activeShabadId + 1);
  };

  return (
    <>
      <i className="fa fa-arrow-circle-o-left" onClick={navigateVerseLeft}></i>
      <i className="fa fa-arrow-circle-o-right" onClick={navigateVerseRight}></i>
    </>
  );
}

export default ShabadHeader;
