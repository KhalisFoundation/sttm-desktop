import React from 'react';

import { StoreProvider } from 'easy-peasy';

import OverlayLayout from './components/OverlayLayout';
import OverlayState from './store/OverlayState';

const App = () => {
  return (
    <StoreProvider store={OverlayState}>
      <OverlayLayout />
    </StoreProvider>
  );
};

export default App;
