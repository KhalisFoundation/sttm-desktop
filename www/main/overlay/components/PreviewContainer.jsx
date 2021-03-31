import React from 'react';
import PropTypes from 'prop-types';

import OverlaySettings from './Options';

import { settingsObjGenerator } from '../utils/parse-overlay-options';

const { bottomBar } = require('../../../configs/overlay.json');

export const PreviewContainer = ({ url }) => {
  const bottomSettings = settingsObjGenerator(bottomBar);

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
