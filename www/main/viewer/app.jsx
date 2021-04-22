import React from 'react';

import { StoreProvider } from 'easy-peasy';

import ShabadDeck from './ShabadDeck/ShabadDeck';

import ViewerState from './store/ViewerState';

const App = () => {
  return (
    <StoreProvider store={ViewerState}>
      <ShabadDeck />
    </StoreProvider>
  );
};

export default App;
