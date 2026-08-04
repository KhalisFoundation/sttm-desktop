import React, { useEffect, useRef } from 'react';
import { ipcRenderer } from 'electron';

import { syncViewerState } from '../../common/store/GlobalState';

const ViewerContent = () => {
  const webviewRef = useRef(null);

  useEffect(() => {
    const handleDomReady = () => {
      ipcRenderer.send('enable-wc-webview', webviewRef.current.getWebContentsId());
      global.webview = webviewRef.current;
      // The deck starts from the built-in defaults, so bring it up to the
      // settings and the selection already in force before the operator sees it.
      syncViewerState();
    };

    const webviewElement = webviewRef.current;
    if (webviewElement) {
      webviewElement.addEventListener('dom-ready', handleDomReady);
    }

    return () => {
      if (webviewElement) {
        webviewElement.removeEventListener('dom-ready', handleDomReady);
        global.webview = null;
      }
    };
  }, []);

  return (
    <div className="viewer-content">
      <webview
        src="viewer.html"
        className="base-ui"
        id="webview-viewer"
        ref={webviewRef}
        /* eslint-disable react/no-unknown-property */
        nodeintegration="true"
        nodeintegrationinsubframes="true"
        /* backgroundThrottling is not inherited from the embedder: the guest keeps its
           own preferences. Without this the Akhand Paatth preview, which is the master
           of the scroll-sync, stops rendering whenever the main window is occluded.
           See the matching comment on the main window in app.js. */
        webpreferences="contextIsolation=no,backgroundThrottling=no"
      />
    </div>
  );
};

export default ViewerContent;
