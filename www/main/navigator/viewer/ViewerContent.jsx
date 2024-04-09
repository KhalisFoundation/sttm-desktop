import React, { useEffect, useRef } from 'react';
import { ipcRenderer } from 'electron';

const ViewerContent = () => {
  const webviewRef = useRef(null);

  useEffect(() => {
    const handleDomReady = () => {
      ipcRenderer.send('enable-wc-webview', webviewRef.current.getWebContentsId());
      global.webview = webviewRef.current;
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
        webpreferences="contextIsolation=no"
      />
    </div>
  );
};

export default ViewerContent;
