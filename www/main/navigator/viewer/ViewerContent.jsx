import React from 'react';

function ViewerContent() {
  return (
    <div className="viewer-content">
      <webview id="main-viewer" nodeintegration="true" src="viewer.html" className="base-ui" />
    </div>
  );
}

export default ViewerContent;
