import React from 'react';

import { StoreProvider } from 'easy-peasy';

import ShabadDeck from './ShabadDeck/ShabadDeck';

import GlobalState from '../common/store/GlobalState';

const App = () => {
  return (
    <StoreProvider store={GlobalState}>
      <ShabadDeck />
    </StoreProvider>
  );
};

export default App;
