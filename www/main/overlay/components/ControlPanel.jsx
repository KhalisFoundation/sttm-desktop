import React from 'react';
import PropTypes from 'prop-types';

import { CopyToClipboard } from './CopyToClipboard';

export const ControlPanel = ({ url }) => {
  return (
    <section className="control-panel">
      <CopyToClipboard url={url} />
    </section>
  );
};

ControlPanel.propTypes = {
  url: PropTypes.string,
};
