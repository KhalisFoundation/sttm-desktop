import React, { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useStoreActions, useStoreState } from 'easy-peasy';

import { uploadImage } from '../../../settings/utils/theme-bg-uploader';
import { classNames } from '../../../common/utils';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');
const analytics = remote.getGlobal('analytics');

export const MiscFooter = ({ waheguruSlide, moolMantraSlide, blankSlide, anandSahibBhog }) => {
  const { currentMiscPanel } = useStoreState((state) => state.navigator);
  const { setVerseHistory, setCurrentMiscPanel } = useStoreActions((state) => state.navigator);
  const drawerRef = useRef(null);
  const [shortcutTray, setShortcutTray] = useState(false);
  // Event Handlers
  const clearHistory = () => {
    setVerseHistory([]);
  };

  const setTab = (tabName) => {
    if (tabName !== currentMiscPanel) {
      setCurrentMiscPanel(tabName);
    }
  };

  const toggleTray = (toggleValue) => {
    setShortcutTray(toggleValue);
    if (toggleValue) {
      analytics.trackEvent('shortcutTray', 'toggleTray', 'openTray', toggleValue);
    } else {
      analytics.trackEvent('shortcutTray', 'toggleTray', 'closeTray', toggleValue);
    }
  };

  return (
    <div
      className={classNames(
        'misc-footer',
        shortcutTray ? 'shortcut-tray-active' : 'shortcut-tray-inactive',
      )}
      ref={drawerRef}
    >
      <div className="clear-pane">
        <div
          className={`quick-tray ${shortcutTray ? 'footer-toggler-inactive' : 'footer-toggler'}`}
          onClick={() => {
            toggleTray(!shortcutTray);
          }}
        >
          <i className={`${shortcutTray ? 'fa fa-caret-down' : 'fa fa-caret-up'}`} />
          <span>{i18n.t(`SHORTCUT_TRAY.QUICK_INSERT`)}</span>
        </div>
        <a className="clear-history" onClick={clearHistory}>
          <i className="fa fa-history" />
          <span>{i18n.t(`SHORTCUT_TRAY.CLEAR_HISTORY`)}</span>
        </a>
      </div>
      <div
        className={`shortcut-drawer ${
          shortcutTray ? 'shortcut-drawer-active' : 'shortcut-drawer-inactive'
        }`}
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
        <button className="tray-item-icon" onClick={blankSlide}>
          <label htmlFor="themebg-upload">
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
        </button>
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
