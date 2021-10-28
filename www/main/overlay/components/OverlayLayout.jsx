import React from 'react';

import { PreviewContainer } from './PreviewContainer';
import { ThemeSelector } from './ThemeSelector';

import getOverlayUrl from '../utils/get-overlay-url';
import { ControlPanel } from './ControlPanel';

const OverlayLayout = () => {
  const previewURL = getOverlayUrl();

  return (
    <main className="canvas">
      <ControlPanel url={previewURL} />
      <PreviewContainer url={`${previewURL}?preview`} />
      <ThemeSelector />
    </main>
  );
};

export default OverlayLayout;
