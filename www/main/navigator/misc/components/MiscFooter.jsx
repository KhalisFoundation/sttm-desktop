import { remote } from 'electron';
import React, { useState, useEffect } from 'react';
import { useStoreActions, useStoreState } from 'easy-peasy';

const { i18n } = remote.require('./app');

export const MiscFooter = () => {
  const {
    isEmptySlide,
    isWaheguruSlide,
    isMoolMantraSlide,
    isAnnouncementSlide,
    isSundarGutkaBani,
    isCeremonyBani,
    ceremonyId,
    shortcuts,
  } = useStoreState(state => state.navigator);
  const {
    setIsEmptySlide,
    setIsWaheguruSlide,
    setVerseHistory,
    setIsMoolMantraSlide,
    setIsAnnouncementSlide,
    setIsSundarGutkaBani,
    setIsCeremonyBani,
    setCeremonyId,
    setShortcuts,
  } = useStoreActions(state => state.navigator);
  const { akhandpatt } = useStoreState(state => state.userSettings);
  const { setAkhandpatt } = useStoreActions(state => state.userSettings);
  // For Global States
  // const navigatorState = useStoreActions(state => state.navigator);
  // For shortcut tray
  const [shortcutOpen, setShortcutOpen] = useState(true);
  const HandleChange = () => {
    setShortcutOpen(!shortcutOpen);
  };

  // Event Handlers
  const clearHistory = () => {
    setVerseHistory([]);
  };

  const openAnandSahibBhog = () => {
    if (isSundarGutkaBani) {
      setIsSundarGutkaBani(false);
    }
    if (ceremonyId !== 6) {
      setCeremonyId(6);
    }
    if (!isCeremonyBani) {
      setIsCeremonyBani(true);
    }
  };

  const openWaheguruSlide = () => {
    if (isEmptySlide) {
      setIsEmptySlide(false);
    }
    if (isAnnouncementSlide) {
      setIsAnnouncementSlide(false);
    }
    if (isMoolMantraSlide) {
      setIsMoolMantraSlide(false);
    }
    if (akhandpatt) {
      setAkhandpatt(false);
    }
    if (!isWaheguruSlide) {
      setIsWaheguruSlide(true);
    }
  };

  const openMoolMantraSlide = () => {
    if (isEmptySlide) {
      setIsEmptySlide(false);
    }
    if (isAnnouncementSlide) {
      setIsAnnouncementSlide(false);
    }
    if (isWaheguruSlide) {
      setIsWaheguruSlide(false);
    }
    if (akhandpatt) {
      setAkhandpatt(false);
    }
    if (!isMoolMantraSlide) {
      setIsMoolMantraSlide(true);
    }
  };

  const openBlankViewer = () => {
    if (isWaheguruSlide) {
      setIsWaheguruSlide(false);
    }
    if (isAnnouncementSlide) {
      setIsAnnouncementSlide(false);
    }
    if (isMoolMantraSlide) {
      setIsMoolMantraSlide(false);
    }
    if (akhandpatt) {
      setAkhandpatt(false);
    }
    if (!isEmptySlide) {
      setIsEmptySlide(true);
    }
  };

  useEffect(() => {
    if (shortcuts.openWaheguruSlide) {
      openWaheguruSlide();
      setShortcuts({
        ...shortcuts,
        openWaheguruSlide: false,
      });
    }
    if (shortcuts.openMoolMantraSlide) {
      openMoolMantraSlide();
      setShortcuts({
        ...shortcuts,
        openMoolMantraSlide: false,
      });
    }
    if (shortcuts.openBlankViewer) {
      openBlankViewer();
      setShortcuts({
        ...shortcuts,
        openBlankViewer: false,
      });
    }
    if (shortcuts.openAnandSahibBhog) {
      setShortcuts({
        ...shortcuts,
        openAnandSahibBhog: false,
      });
      openAnandSahibBhog();
    }
  }, [shortcuts]);

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
        <button className="tray-item-icon" onClick={openAnandSahibBhog}>
          {i18n.t(`SHORTCUT_TRAY.ANAND_SAHIB`)}
        </button>
        <button className="tray-item-icon" onClick={openMoolMantraSlide}>
          {i18n.t(`SHORTCUT_TRAY.MOOL_MANTRA`)}
        </button>
        <button className="gurmukhi tray-item-icon" onClick={openWaheguruSlide}>
          vwihgurU
        </button>
        <button className="tray-item-icon" onClick={openBlankViewer}>
          {i18n.t(`SHORTCUT_TRAY.BLANK`)}
        </button>
      </div>
    </div>
  );
};
