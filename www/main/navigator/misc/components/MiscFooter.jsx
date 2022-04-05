import React from 'react';
import { remote } from 'electron';
import PropTypes from 'prop-types';
import { useStoreActions, useStoreState } from 'easy-peasy';

const { i18n } = remote.require('./app');
const analytics = remote.getGlobal('analytics');

export const MiscFooter = ({ waheguruSlide, moolMantraSlide, blankSlide, anandSahibBhog }) => {
  const { shortcutTray } = useStoreState(state => state.userSettings);
  const { setVerseHistory } = useStoreActions(state => state.navigator);
  const { setShortcutTray } = useStoreActions(state => state.userSettings);
  // Event Handlers
  const clearHistory = () => {
    setVerseHistory([]);
  };

  const toggleShortcuts = () => {
    setShortcutTray(!shortcutTray);
    analytics.trackEvent('shortcutTrayToggle', shortcutTray);
  };

  return (
    <div className="misc-footer">
      <div className="clear-pane">
        <div
          className={`${shortcutTray ? 'footer-toggler' : 'footer-toggler-inactive '}`}
          onClick={toggleShortcuts}
        >
          <i className={`${shortcutTray ? 'fa fa-caret-down' : 'fa fa-caret-up'}`} />
        </div>
        <a className="clear-history" onClick={clearHistory()}>
          <i className="fa fa-history" />
          <span>Clear History</span>
        </a>
      </div>
      <div className={`${shortcutTray ? 'shortcut-drawer-active' : 'shortcut-drawer'}`}>
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
