import React from 'react';
import { StoreProvider } from 'easy-peasy';

import GlobalState from './common/store/GlobalState';
import Launchpad from './launchpad';
import ErrorBoundary from './common/ErrorBoundary';
import { globalInit } from './common/constants';
import ShadowCollector from './addons/voice-follow/shadow/ShadowCollector';

// Initialize globals
globalInit.socket();

const App = () => (
  <ErrorBoundary label="main-window">
    <StoreProvider store={GlobalState}>
      <Launchpad />
      <ShadowCollector />
    </StoreProvider>
  </ErrorBoundary>
);

export default App;
