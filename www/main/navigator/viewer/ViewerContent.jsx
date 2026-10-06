import React, { useEffect, useRef } from 'react';
import { ipcRenderer } from 'electron';

const ViewerContent = () => {
  const webviewRef = useRef(null);

  useEffect(() => {
    const handleDomReady = () => {
      if (!webviewRef.current) return;
      try {
        ipcRenderer.send('enable-wc-webview', webviewRef.current.getWebContentsId());
        global.webview = webviewRef.current;
        global.webview.send('update-settings');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[preview] webview dom-ready failed', err);
      }
    };

    const webviewElement = webviewRef.current;
    if (webviewElement) {
      webviewElement.addEventListener('dom-ready', handleDomReady);
    }

    return () => {
      if (webviewElement) {
        webviewElement.removeEventListener('dom-ready', handleDomReady);
        if (global.webview === webviewElement) {
          global.webview = null;
        }
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

