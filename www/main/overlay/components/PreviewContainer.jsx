import React from 'react';
import PropTypes from 'prop-types';

import OverlaySettings from './Options';

import { bottomSettings } from '../utils/parse-overlay-options';

export const PreviewContainer = ({ url }) => {
  return (
    <section className="preview-container">
      <webview className="preview" src={url}></webview>
      <section className="bottom-settings">
        <OverlaySettings settingsObj={bottomSettings} />
      </section>
    </section>
  );
};

PreviewContainer.propTypes = {
  url: PropTypes.string,
};
