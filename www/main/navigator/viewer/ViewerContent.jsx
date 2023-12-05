import React from 'react';

const ViewerContent = () => (
  <div className="viewer-content">
    <webview
      src="viewer.html"
      className="base-ui"
      id="webview-viewer"
      nodeintegration="true"
      nodeintegrationinsubframes="true"
      webpreferences="contextIsolation=no"
    />
  </div>
);

export default ViewerContent;
