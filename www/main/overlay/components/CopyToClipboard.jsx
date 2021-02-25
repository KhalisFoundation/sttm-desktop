import React from 'react';
import PropTypes from 'prop-types';

export const CopyToClipboard = ({ url }) => {
  return (
    <div className="overlay-url">
      <p className="overlay-window-text live-url-header">Live URL</p>
      <div className="url-container">
        <input disabled={true} type="text" className="url-text" value={url} />
        <span className="export-btn">
          <i className="fa fa-files-o cp-icon"></i>
        </span>
      </div>
    </div>
  );
};

CopyToClipboard.propTypes = {
  url: PropTypes.string,
};
