import { remote } from 'electron';
import PropTypes from 'prop-types';
import React, { useState } from 'react';
import { useStoreActions } from 'easy-peasy';

const analytics = remote.getGlobal('analytics');
const { i18n } = remote.require('./app');

export const MiscFooter = ({ waheguruSlide, moolMantraSlide, blankSlide, anandSahibBhog }) => {
  const { setVerseHistory } = useStoreActions(state => state.navigator);

  // For shortcut tray
  const [shortcutOpen, setShortcutOpen] = useState(true);
  const HandleChange = () => {
    setShortcutOpen(!shortcutOpen);
    analytics.trackEvent('shortcutTrayToggle', shortcutOpen);
  };

  // Event Handlers
  const clearHistory = () => {
    setVerseHistory([]);
  };

  return (
    <div className="misc-footer">
      <div className="clear-pane">
        <div
          className={`${!shortcutOpen ? 'footer-toggler' : 'footer-toggler-inactive '}`}
          onClick={HandleChange}
        >
          <i className={`${shortcutOpen ? 'fa fa-caret-down' : 'fa fa-caret-up'}`} />
        </div>
        <a className="clear-history" onClick={clearHistory}>
          <i className="fa fa-history" />
          <span>Clear History</span>
        </a>
      </div>
      <div className={`${shortcutOpen ? 'shortcut-drawer-active' : 'shortcut-drawer'}`}>
        <button className="tray-item-icon" onClick={anandSahibBhog}>
          {i18n.t(`SHORTCUT_TRAY.ANAND_SAHIB`)}
        </button>
        <button className="tray-item-icon" onClick={moolMantraSlide}>
          {i18n.t(`SHORTCUT_TRAY.MOOL_MANTRA`)}
        </button>
        <button className="gurmukhi tray-item-icon" onClick={waheguruSlide}>
          vwihgurU
        </button>
        <button className="tray-item-icon" onClick={blankSlide}>
          {i18n.t(`SHORTCUT_TRAY.BLANK`)}
        </button>
      </div>
    </div>
  );
};

MiscFooter.propTypes = {
  waheguruSlide: PropTypes.func,
  moolMantraSlide: PropTypes.func,
  blankSlide: PropTypes.func,
  anandSahibBhog: PropTypes.func,
};
