import React from 'react';
import { StoreProvider } from 'easy-peasy';

import GlobalState from './common/store/GlobalState';
import Launchpad from './launchpad';
import { globalInit } from './common/constants';
import ShadowCollector from './addons/voice-follow/shadow/ShadowCollector';

// Initialize globals
globalInit.socket();

const App = () => (
  <StoreProvider store={GlobalState}>
    <Launchpad />
    <ShadowCollector />
  </StoreProvider>
);

export default App;
