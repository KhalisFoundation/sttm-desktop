import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

function ShabadHeader() {
  const { shabadSelected } = useStoreState(state => state.navigator);
  const { setShabadSelected } = useStoreActions(state => state.navigator);

  const navigateVerseLeft = () => {
    setShabadSelected(shabadSelected - 1);
  };
  const navigateVerseRight = () => {
    setShabadSelected(shabadSelected + 1);
  };

  return (
    <>
      <i className="fa fa-arrow-circle-o-left" onClick={navigateVerseLeft}></i>
      <i className="fa fa-arrow-circle-o-right" onClick={navigateVerseRight}></i>
    </>
  );
}

export default ShabadHeader;
