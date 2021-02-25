import React from 'react';
import { useStoreActions, useStoreState } from 'easy-peasy';
function SearchResults() {
  const verse = useStoreState(state => state.navigator.verseSelected);

  return <div>{verse ? <div>{verse}</div> : ''}</div>;
}

export default SearchResults;
