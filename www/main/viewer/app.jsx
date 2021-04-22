import React from 'react';

import { StoreProvider } from 'easy-peasy';

import ShabadDeck from './ShabadDeck/ShabadDeck';

import GlobalState from '../common/store/GlobalState';
// import ViewerState from './store/ViewerState';

// ViewerGlobal.userSettings = GlobalState.getState().userSettings;

const App = () => {
  return (
    <StoreProvider store={GlobalState}>
      <ShabadDeck />
    </StoreProvider>
  );
};

export default App;
