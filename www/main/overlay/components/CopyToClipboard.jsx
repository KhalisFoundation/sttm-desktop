import React from 'react';
import PropTypes from 'prop-types';

const { remote } = require('electron');

const copy = require('copy-to-clipboard');

const { i18n } = remote.require('./app');

export const CopyToClipboard = ({ url }) => {
  return (
    <div className="overlay-url">
      <p className="overlay-window-text live-url-header">{i18n.t(`BANI_OVERLAY.LIVE_URL`)}</p>
      <div className="url-container">
        <input disabled={true} type="text" className="url-text" value={url} />
        <span
          className="export-btn"
          onClick={() => {
            copy(url);
          }}
        >
          <i className="fa fa-files-o cp-icon"></i>
        </span>
      </div>
    </div>
  );
};

CopyToClipboard.propTypes = {
  url: PropTypes.string,
};
