import React from 'react';
import PropTypes from 'prop-types';

const remote = require('@electron/remote');
const copy = require('copy-to-clipboard');

const { i18n } = remote.require('./app');

export const CopyToClipboard = ({ url }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    copy(url);
    setCopied(true);
  };

  return (
    <div className="overlay-url">
      <p className="overlay-window-text live-url-header">{i18n.t(`BANI_OVERLAY.LIVE_URL`)}</p>
      <div className="url-container">
        <input
          type="text"
          className="url-text"
          onClick={handleCopy}
          onFocus={(event) => event.target.select()} // Select all text on focus
          onMouseLeave={() => setCopied(false)}
          readOnly={true}
          value={url}
        />
        <span
          className="export-btn"
          onClick={handleCopy}
          onMouseLeave={() => setCopied(false)}
        >
          <i className="fa fa-files-o cp-icon"></i>
        </span>
        <span className="tooltip">
          {copied ? i18n.t('BANI_OVERLAY.COPIED_URL') : i18n.t('BANI_OVERLAY.COPY_URL')}
        </span>
      </div>
    </div>
  );
};



CopyToClipboard.propTypes = {
  url: PropTypes.string,
};
