import React from 'react';
import PropTypes from 'prop-types';

import { CopyToClipboard } from './CopyToClipboard';
import OverlaySettings from './Options';
import { settingsObj } from '../utils/parse-overlay-options';

export const ControlPanel = ({ url }) => {
  return (
    <section className="control-panel">
      <OverlaySettings settingsObj={settingsObj} />
      <CopyToClipboard url={url} />
    </section>
  );
};

ControlPanel.propTypes = {
  url: PropTypes.string,
};
