import React from 'react';
import { StoreProvider } from 'easy-peasy';

import GlobalState from './common/store/GlobalState';
import Launchpad from './launchpad';
import ErrorBoundary from './common/ErrorBoundary';
import { globalInit } from './common/constants';

// Initialize globals
globalInit.socket();

const App = () => (
  <ErrorBoundary label="main-window">
    <StoreProvider store={GlobalState}>
      <Launchpad />
    </StoreProvider>
  </ErrorBoundary>
);

export default App;
