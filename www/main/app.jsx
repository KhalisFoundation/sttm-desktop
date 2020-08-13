/* eslint-disable */
import React from 'react';
import { StoreProvider } from 'easy-peasy';

import GlobalState from './store/GlobalState';
import Launchpad from './launchpad';

const App = () => {
  return (
    <StoreProvider store={GlobalState}>
      <Launchpad />
    </StoreProvider>
  );
};

export default App;