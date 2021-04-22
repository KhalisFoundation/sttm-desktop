import React from 'react';

import { StoreProvider } from 'easy-peasy';

import GlobalState from '../common/store/GlobalState';

import OverlayLayout from './components/OverlayLayout';

global.getOverlaySettings = GlobalState.getState().baniOverlay;

const App = () => {
  return (
    <StoreProvider store={GlobalState}>
      <OverlayLayout />
    </StoreProvider>
  );
};

export default App;
