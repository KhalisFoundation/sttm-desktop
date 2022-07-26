import React from 'react';

const ViewerContent = () => {
  return (
    <div className="viewer-content">
      <webview id="webview-viewer" webpreferences="nodeintegration" src="viewer.html" className="base-ui" />
    </div>
  );
};

export default ViewerContent;
