import React, { useRef } from 'react';
import PropTypes from 'prop-types';
import { useStoreActions, useStoreState } from 'easy-peasy';

import { uploadImage } from '../../../settings/utils/theme-bg-uploader';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');
const analytics = remote.getGlobal('analytics');

export const MiscFooter = ({ waheguruSlide, moolMantraSlide, blankSlide, anandSahibBhog }) => {
  const { shortcutTray } = useStoreState((state) => state.userSettings);
  const { setShortcutTray } = useStoreActions((state) => state.userSettings);
  const { currentMiscPanel } = useStoreState((state) => state.navigator);
  const { setVerseHistory, setCurrentMiscPanel } = useStoreActions((state) => state.navigator);
  const drawerRef = useRef(null);
  // Event Handlers
  const clearHistory = () => {
    setVerseHistory([]);
  };

  const setTab = (tabName) => {
    if (tabName !== currentMiscPanel) {
      setCurrentMiscPanel(tabName);
    }
  };
  const toggleShortcuts = () => {
    drawerRef.current.classList.toggle('shortcut-drawer-active');
    const changeState = () => {
      setShortcutTray(!shortcutTray);
    };
    drawerRef.current.removeEventListener('transitionend', changeState);
    drawerRef.current.addEventListener('transitionend', changeState);
    analytics.trackEvent('shortcutTrayToggle', shortcutTray);
  };

  return (
    <div className="misc-footer">
      <div className="clear-pane">
        <div
          className={`${shortcutTray ? 'footer-toggler-inactive' : 'footer-toggler'}`}
          onClick={toggleShortcuts}
        >
          <i className={`${shortcutTray ? 'fa fa-caret-down' : 'fa fa-caret-up'}`} />
        </div>
        <a className="clear-history" onClick={clearHistory}>
          <i className="fa fa-history" />
          <span>Clear History</span>
        </a>
      </div>
      <div
        ref={drawerRef}
        className={`shortcut-drawer ${shortcutTray ? 'shortcut-drawer-active' : ''}`}
      >
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
        <label className="tray-item-icon">
          {i18n.t('SHORTCUT_TRAY.CUSTOM_IMAGE')}
          <input
            className="file-input"
            onChange={async (e) => {
              await uploadImage(e);
            }}
            id="themebg-upload"
            type="file"
            accept="image/png, image/jpeg"
          />
        </label>
        <button className="tray-item-icon" onClick={() => setTab('Insert')}>
          {i18n.t(`SHORTCUT_TRAY.ANNOUNCEMENT`)}
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
