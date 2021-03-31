import React from 'react';
import PropTypes from 'prop-types';

import { CopyToClipboard } from './CopyToClipboard';
import OverlaySettings from './Options';
import { settingsObjGenerator } from '../utils/parse-overlay-options';

const { sidebar } = require('../../../configs/overlay.json');

export const ControlPanel = ({ url }) => {
  const settingsObj = settingsObjGenerator(sidebar);

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
