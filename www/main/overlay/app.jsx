import React from 'react';

import { StoreProvider } from 'easy-peasy';

import GlobalState from './store/GlobalState';

import OverlayLayout from './components/OverlayLayout';

const App = () => {
  return (
    <StoreProvider store={GlobalState}>
      <OverlayLayout />
    </StoreProvider>
  );
};

export default App;
