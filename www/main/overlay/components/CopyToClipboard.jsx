import React from 'react';
import PropTypes from 'prop-types';
import { i18n } from '../../common/i18n';

const copy = require('copy-to-clipboard');

export const CopyToClipboard = ({ url }) => {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = () => {
    copy(url);
    setCopied(true);
  };

  return (
    <div className="overlay-url">
      <label className="overlay-url-field">
        <span className="overlay-url-label">{i18n.t('BANI_OVERLAY.LIVE_URL')}</span>
        <input
          type="text"
          readOnly
          value={url}
          onFocus={(event) => event.target.select()} // Select all text on focus
        />
      </label>
      <button type="button" className="overlay-url-copy" onClick={handleCopy}>
        <i className={`fa ${copied ? 'fa-check' : 'fa-files-o'}`} />
        {copied ? i18n.t('BANI_OVERLAY.COPIED_URL') : i18n.t('BANI_OVERLAY.COPY_URL')}
      </button>
      <p className="overlay-url-hint">{i18n.t('BANI_OVERLAY.LIVE_URL_HINT')}</p>
    </div>
  );
};

CopyToClipboard.propTypes = {
  url: PropTypes.string,
};
