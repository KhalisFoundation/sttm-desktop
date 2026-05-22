import React, { createContext, useRef } from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

import Toolbar from '../toolbar';
import Navigator from '../navigator';
import WorkspaceBar from '../workspace-bar';
import { useKeys, useSlides } from '../common/hooks';

import {
  Ceremonies,
  SundarGutka,
  BaniController,
  LockScreen,
  AuthDialog,
  Announcement,
} from '../addons';
import { Settings } from '../settings/';

import { DEFAULT_OVERLAY } from '../common/constants';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');
const main = remote.require('./app');

export const InputContext = createContext();

const EMPTY_SHORTCUTS = {};

const Launchpad = () => {
  // Select specific fields rather than destructuring from a parent slice —
  // the parent-slice form returns an immer/easy-peasy proxy that can get
  // revoked between renders during error recovery, leading to spurious
  // "Cannot perform 'get' on a proxy that has been revoked" crashes.
  //
  // Even with per-field selectors, the parent-slice proxy can transiently be
  // revoked mid-tick during rapid action cascades (e.g. fast bani↔shabad
  // transitions over the controller). The safeSelect wrapper catches those
  // revoked-proxy reads and returns a stable fallback, so the next render
  // re-runs against a fresh state instead of the whole tree unmounting.
  // Fallbacks are module-level constants so repeated failures don't churn
  // useSyncExternalStore equality checks and loop.
  const safeSelect = (selector, fallback) => {
    try {
      const value = selector();
      return value === undefined ? fallback : value;
    } catch (e) {
      return fallback;
    }
  };
  const overlayScreen = useStoreState((state) =>
    safeSelect(() => state.app.overlayScreen, DEFAULT_OVERLAY),
  );
  const shortcuts = useStoreState((state) =>
    safeSelect(() => state.navigator.shortcuts, EMPTY_SHORTCUTS),
  );
  const setShortcuts = useStoreActions((state) => state.navigator.setShortcuts);
  const setOverlayScreen = useStoreActions((actions) => actions.app.setOverlayScreen);
  const currentWorkspace = useStoreState((state) =>
    safeSelect(() => state.userSettings.currentWorkspace, ''),
  );
  const defaultPaneId = useStoreState((state) =>
    safeSelect(() => state.userSettings.defaultPaneId, 1),
  );

  const {
    displayWaheguruSlide,
    displayMoolMantraSlide,
    displayBlankViewer,
    displayAnandSahibBhog,
  } = useSlides();

  const ref = useRef();

  const onScreenClose = React.useCallback(
    (evt) => {
      let isFromBackdrop = false;
      if (evt) {
        isFromBackdrop = evt.currentTarget.classList.contains('backdrop');
        const clickdOnEmptySpace = evt.target.classList.contains('addon-wrapper');
        // close only when clicked on empty space in backdrop.
        // Otherwiise keep the add-on screen opened up.
        if (isFromBackdrop && clickdOnEmptySpace) {
          setOverlayScreen(DEFAULT_OVERLAY);
        }
      }
      if (!isFromBackdrop) {
        document.body.classList.toggle(`overlay-${overlayScreen}-active`, false);
        setOverlayScreen(DEFAULT_OVERLAY);
      }
    },
    [overlayScreen, setOverlayScreen, DEFAULT_OVERLAY],
  );

  /** ******************************* */
  /** *******Keyboard Shortcuts****** */
  /** ******************************* */

  // open waheguru slide shortcut
  const handleCtrlPlus1 = () => {
    displayWaheguruSlide({ openedFrom: 'shortcuts' });
  };

  // open mool mantra slide shortcut
  const handleCtrlPlus2 = () => {
    displayMoolMantraSlide({ openedFrom: 'shortcuts' });
  };

  // open blank slide shortcut
  const handleCtrlPlus3 = () => {
    displayBlankViewer({ openedFrom: 'shortcuts' });
  };

  // open anand sahib bhog slide shortcut
  const handleCtrlPlus4 = () => {
    if (currentWorkspace === i18n.t('WORKSPACES.MULTI_PANE')) {
      displayAnandSahibBhog({ openedFrom: 'shortcuts', paneId: defaultPaneId });
    } else {
      displayAnandSahibBhog({ openedFrom: 'shortcuts' });
    }
  };

  const handleCtrlPlus5 = () => {
    main.openSecondaryWindow('helpWindow');
  };

  const handleCtrlPlus6 = () => {
    main.openSecondaryWindow('shortcutLegend');
  };

  // focus on search shabad input shortcut
  const handleCtrlPlusSlash = () => {
    if (!shortcuts.focusInput) {
      setShortcuts({
        ...shortcuts,
        focusInput: true,
      });
    }
  };

  const handleDownAndRight = () => {
    if (!shortcuts.nextVerse && document.activeElement !== ref.current) {
      setShortcuts({
        ...shortcuts,
        nextVerse: true,
      });
    }
  };

  const handleUpAndLeft = () => {
    if (!shortcuts.prevVerse && document.activeElement !== ref.current) {
      setShortcuts({
        ...shortcuts,
        prevVerse: true,
      });
    }
  };

  const handleSpacebar = () => {
    if (!shortcuts.homeVerse && document.activeElement !== ref.current) {
      setShortcuts({
        ...shortcuts,
        homeVerse: true,
      });
    }
  };

  const handleEnter = () => {
    if (!shortcuts.openFirstResult) {
      ref.current.blur();
      setShortcuts({
        ...shortcuts,
        openFirstResult: true,
      });
    }
  };

  const handleCtrlG = () => {
    if (!shortcuts.openDhanGuruSlide) {
      setShortcuts({
        ...shortcuts,
        openDhanGuruSlide: true,
      });
    }
  };

  const handleCtrlC = () => {
    if (!shortcuts.copyToClipboard) {
      setShortcuts({
        ...shortcuts,
        copyToClipboard: true,
      });
    }
  };

  useKeys('Digit1', 'combination', handleCtrlPlus1);
  useKeys('Digit2', 'combination', handleCtrlPlus2);
  useKeys('Digit3', 'combination', handleCtrlPlus3);
  useKeys('Digit4', 'combination', handleCtrlPlus4);
  useKeys('Digit5', 'combination', handleCtrlPlus5);
  useKeys('Digit6', 'combination', handleCtrlPlus6);
  useKeys('Slash', 'combination', handleCtrlPlusSlash);
  useKeys('ArrowDown', 'single', handleDownAndRight);
  useKeys('ArrowRight', 'single', handleDownAndRight);
  useKeys('ArrowUp', 'single', handleUpAndLeft);
  useKeys('ArrowLeft', 'single', handleUpAndLeft);
  useKeys('Space', 'single', handleSpacebar);
  useKeys('Enter', 'single', handleEnter);
  useKeys('NumpadEnter', 'single', handleEnter);
  useKeys('KeyG', 'combination', handleCtrlG);
  useKeys('KeyC', 'combination', handleCtrlC);

  const isSundarGutkaOverlay = overlayScreen === 'sunder-gutka';
  const isBaniControllerOverlay = overlayScreen === 'sync-button';
  const isCeremoniesOverlay = overlayScreen === 'ceremonies';
  const isLockScreen = overlayScreen === 'lock-screen';
  const isSettingsOverlay = overlayScreen === 'settings';
  const isAuthDialog = overlayScreen === 'auth-dialog';
  const isAnnouncement = overlayScreen === 'announcement';
  const isSingleDisplayMode = currentWorkspace === i18n.t('WORKSPACES.SINGLE_DISPLAY');

  return (
    <>
      <WorkspaceBar />
      <div className={`launchpad${isSingleDisplayMode ? ' single-display misc-pane' : ''}`}>
        <Toolbar />
        {isSundarGutkaOverlay && <SundarGutka onScreenClose={onScreenClose} />}
        <BaniController
          onScreenClose={onScreenClose}
          className={isBaniControllerOverlay ? '' : 'd-none'}
        />
        {isCeremoniesOverlay && <Ceremonies onScreenClose={onScreenClose} />}
        {isLockScreen && <LockScreen onScreenClose={onScreenClose} />}
        <Announcement onScreenClose={onScreenClose} className={isAnnouncement ? '' : 'd-none'} />
        {isSettingsOverlay && <Settings onScreenClose={onScreenClose} />}
        <AuthDialog onScreenClose={onScreenClose} className={isAuthDialog ? '' : 'd-none'} />
        <InputContext.Provider value={ref}>
          <Navigator />
        </InputContext.Provider>
      </div>
    </>
  );
};

export default Launchpad;
