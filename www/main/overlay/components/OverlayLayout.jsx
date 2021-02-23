import React from 'react';

import { PreviewContainer } from './PreviewContainer';
import { ThemeSelector } from './ThemeSelector';

import getOverlayUrl from '../utils/get-overlay-url';

const OverlayLayout = () => {
  const previewURL = `${getOverlayUrl()}?preview`;
  return (
    <main className="canvas">
      <PreviewContainer url={previewURL} />
      <ThemeSelector />
    </main>
  );
};

export default OverlayLayout;
