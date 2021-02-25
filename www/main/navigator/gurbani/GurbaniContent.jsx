import React from 'react';
import { useStoreActions, useStoreState } from 'easy-peasy';
function GurbaniContent() {
  const selectedVerse = useStoreState(state => state.navigator.verseSelected);
  return <div>{selectedVerse ? <div className="verse">{selectedVerse}</div> : ''}</div>;
}

export default GurbaniContent;
