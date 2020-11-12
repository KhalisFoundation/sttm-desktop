import React from 'react';
import { StoreProvider } from 'easy-peasy';

import GlobalState from './common/store/GlobalState';
import Launchpad from './launchpad';
import { globalInit } from './common/constants';

// Initialize globals
globalInit.socket();

const App = () => {
  return (
    <StoreProvider store={GlobalState}>
      <Launchpad />
    </StoreProvider>
  );
};

export default App;
