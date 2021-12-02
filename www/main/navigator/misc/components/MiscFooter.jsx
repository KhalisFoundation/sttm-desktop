import React, { useState } from 'react';
import { remote } from 'electron';
import PropTypes from 'prop-types';
import { useStoreActions } from 'easy-peasy';

const { i18n } = remote.require('./app');
const analytics = remote.getGlobal('analytics');

export const MiscFooter = ({ waheguruSlide, moolMantraSlide, blankSlide, anandSahibBhog }) => {
  const shortcutsState = JSON.parse(localStorage.getItem('isShortcutsOpen'));
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(shortcutsState);
  const { setVerseHistory } = useStoreActions(state => state.navigator);
  // Event Handlers
  const clearHistory = () => {
    setVerseHistory([]);
  };

  const toggleShortcuts = () => {
    const event = new CustomEvent('openShortcut', {
      detail: { value: !shortcutsState },
    });
    document.dispatchEvent(event);
    localStorage.setItem('isShortcutsOpen', !shortcutsState);
    setIsShortcutsOpen(!shortcutsState);
    analytics.trackEvent('shortcutTrayToggle', isShortcutsOpen);
  };

  return (
    <div className="misc-footer">
      <div className="clear-pane">
        <div
          className={`${!isShortcutsOpen ? 'footer-toggler' : 'footer-toggler-inactive '}`}
          onClick={toggleShortcuts}
        >
          <i className={`${isShortcutsOpen ? 'fa fa-caret-down' : 'fa fa-caret-up'}`} />
        </div>
        <a className="clear-history" onClick={clearHistory}>
          <i className="fa fa-history" />
          <span>Clear History</span>
        </a>
      </div>
      <div className={`${isShortcutsOpen ? 'shortcut-drawer-active' : 'shortcut-drawer'}`}>
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
