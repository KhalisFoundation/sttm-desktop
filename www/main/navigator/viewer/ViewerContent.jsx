import React, { useEffect, useRef } from 'react';
import { ipcRenderer } from 'electron';
import { useStoreState } from 'easy-peasy';

const ViewerContent = () => {
  const webviewRef = useRef(null);
  // A preview (re)loaded while Voice Autopilot is on learns it too (its Auto Play button).
  const autopilotLive = useStoreState((state) => state.app.autopilotLive);
  const autopilotLiveRef = useRef(false);
  autopilotLiveRef.current = autopilotLive;

  useEffect(() => {
    const handleDomReady = () => {
      if (!webviewRef.current) return;
      try {
        ipcRenderer.send('enable-wc-webview', webviewRef.current.getWebContentsId());
        global.webview = webviewRef.current;
        global.webview.send('update-settings');
        if (autopilotLiveRef.current) {
          global.webview.send(
            'update-viewer-setting',
            JSON.stringify({ payload: true, actionName: 'setAutopilotLive', settingType: 'app' }),
          );
        }
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
