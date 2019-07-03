import { getInitialStateRenderer } from 'electron-redux';
import React from 'react';
import { render } from 'react-dom';
import { Provider } from 'react-redux';
// Store
import configureStore from '../shared/configureStore';
// Custom components
import Navigator from './Navigator';

// Add platform name to body as a class for platform-specific styling
document.body.classList.add(process.platform);

// Get the initial state from the main process and configure store with it
const initialState = getInitialStateRenderer();
const store = configureStore(initialState, 'renderer');

const App = () => {
  return (
    <Provider store={store}>
      <webview id="main-viewer" src="viewer.html" nodeintegration="true" className="base-ui" />
      <Navigator />
    </Provider>
  );
};

render(<App />, document.getElementById('app-frame'));
