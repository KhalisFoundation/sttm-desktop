import React from 'react';

import { CopyToClipboard } from './CopyToClipboard';
import { PreviewContainer } from './PreviewContainer';
import { OverlaySidebar } from './OverlaySidebar';

import getOverlayUrl from '../utils/get-overlay-url';

const OverlayLayout = () => {
  const previewURL = getOverlayUrl();

  return (
    <div className="overlay-app">
      <header className="overlay-header">
        <CopyToClipboard url={previewURL} />
      </header>
      <div className="overlay-body">
        <PreviewContainer url={`${previewURL}?preview`} />
        <OverlaySidebar />
      </div>
    </div>
  );
};

export default OverlayLayout;
