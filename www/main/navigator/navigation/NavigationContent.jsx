import React from 'react';
import { useStoreActions, useStoreState } from 'easy-peasy';

function NavigationContent() {
  const verse = useStoreState(state => state.navigator.verseSelected);

  return <div>{verse}</div>;
}

export default NavigationContent;
