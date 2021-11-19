import { remote } from 'electron';
import React, { useState, useEffect } from 'react';
import { useStoreActions, useStoreState } from 'easy-peasy';
import insertSlide from '../../../common/constants/slidedb';

const analytics = remote.getGlobal('analytics');
const { i18n } = remote.require('./app');

export const MiscFooter = () => {
  const {
    isMiscSlide,
    miscSlideText,
    isAnnoucement,
    isSundarGutkaBani,
    isCeremonyBani,
    ceremonyId,
    shortcuts,
  } = useStoreState(state => state.navigator);
  const {
    setVerseHistory,
    setIsSundarGutkaBani,
    setIsCeremonyBani,
    setCeremonyId,
    setShortcuts,
    setIsMiscSlide,
    setMiscSlideText,
    setIsAnnoucement,
  } = useStoreActions(state => state.navigator);
  const { akhandpatt } = useStoreState(state => state.userSettings);
  const { setAkhandpatt } = useStoreActions(state => state.userSettings);
  // For Global States
  // const navigatorState = useStoreActions(state => state.navigator);
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

  const openAnandSahibBhog = () => {
    if (isSundarGutkaBani) {
      setIsSundarGutkaBani(false);
    }
    if (ceremonyId !== 3) {
      setCeremonyId(3);
    }
    if (!isCeremonyBani) {
      setIsCeremonyBani(true);
    }
  };

  const addMiscSlide = givenText => {
    if (isAnnoucement) {
      setIsAnnoucement(false);
    }
    if (!isMiscSlide) {
      if (akhandpatt) {
        setAkhandpatt(false);
      }
      setIsMiscSlide(true);
    }
    if (miscSlideText !== givenText) {
      setMiscSlideText(givenText);
    }
  };

  const openWaheguruSlide = () => {
    addMiscSlide(insertSlide.slideStrings.waheguru);
  };

  const openMoolMantraSlide = () => {
    addMiscSlide(insertSlide.slideStrings.moolMantra);
  };

  const openBlankViewer = () => {
    addMiscSlide('');
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
