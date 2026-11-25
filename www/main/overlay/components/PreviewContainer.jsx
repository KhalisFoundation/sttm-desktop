import React from 'react';
import PropTypes from 'prop-types';

import OverlaySettingsContainer from './OverlaySettingsContainer';

import { bottomSettings } from '../utils/parse-overlay-options';

export const PreviewContainer = ({ url }) => (
  <section className="overlay-stage">
    <div className="overlay-preview-area">
      <div className="overlay-preview-frame">
        <webview className="overlay-preview" src={url}></webview>
      </div>
    </div>
    <div className="overlay-toolbar">
      <OverlaySettingsContainer settingsObj={bottomSettings} variant="toolbar" />
    </div>
  </section>
);

PreviewContainer.propTypes = {
  url: PropTypes.string,
};
