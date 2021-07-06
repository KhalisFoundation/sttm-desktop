import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

import Toolbar from '../toolbar';
import Navigator from '../navigator';
import WorkspaceBar from '../workspace-bar';
import { useKeys } from '../common/hooks';

import { Ceremonies, SundarGutka, BaniController, LockScreen } from '../addons';
import { Settings } from '../settings/';

import { DEFAULT_OVERLAY } from '../common/constants';

const Launchpad = () => {
  const { overlayScreen } = useStoreState(state => state.app);
  const { shortcuts } = useStoreState(state => state.navigator);
  const { setShortcuts } = useStoreActions(state => state.navigator);
  const { setOverlayScreen } = useStoreActions(actions => actions.app);
  const { isSingleDisplayMode } = useStoreState(state => state.userSettings);

  const onScreenClose = React.useCallback(
    evt => {
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
    if (!shortcuts.openWaheguruSlide) {
      setShortcuts({
        ...shortcuts,
        openWaheguruSlide: true,
      });
    }
  };

  // open mool mantra slide shortcut
  const handleCtrlPlus2 = () => {
    if (!shortcuts.openMoolMantraSlide) {
      setShortcuts({
        ...shortcuts,
        openMoolMantraSlide: true,
      });
    }
  };

  // open blank slide shortcut
  const handleCtrlPlus3 = () => {
    if (!shortcuts.openBlankViewer) {
      setShortcuts({
        ...shortcuts,
        openBlankViewer: true,
      });
    }
  };

  // open anand sahib bhog slide shortcut
  const handleCtrlPlus4 = () => {
    if (!shortcuts.openAnandSahibBhog) {
      setShortcuts({
        ...shortcuts,
        openAnandSahibBhog: true,
      });
    }
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

  // handle down and right arrow key
  const handleDownAndRight = () => {
    if (!shortcuts.nextVerse) {
      setShortcuts({
        ...shortcuts,
        nextVerse: true,
      });
    }
  };

  // handle down and right arrow key
  const handleUpAndLeft = () => {
    if (!shortcuts.prevVerse) {
      setShortcuts({
        ...shortcuts,
        prevVerse: true,
      });
    }
  };

  // handle down and right arrow key
  const handleSpacebar = () => {
    if (!shortcuts.homeVerse) {
      setShortcuts({
        ...shortcuts,
        homeVerse: true,
      });
    }
  };

  // handle down and right arrow key
  const handleEnter = () => {
    if (!shortcuts.openFirstResult) {
      setShortcuts({
        ...shortcuts,
        openFirstResult: true,
      });
    }
  };

  useKeys('Digit1', 'combination', handleCtrlPlus1);
  useKeys('Digit2', 'combination', handleCtrlPlus2);
  useKeys('Digit3', 'combination', handleCtrlPlus3);
  useKeys('Digit4', 'combination', handleCtrlPlus4);
  useKeys('Slash', 'combination', handleCtrlPlusSlash);
  useKeys('ArrowDown', 'single', handleDownAndRight);
  useKeys('ArrowRight', 'single', handleDownAndRight);
  useKeys('ArrowUp', 'single', handleUpAndLeft);
  useKeys('ArrowLeft', 'single', handleUpAndLeft);
  useKeys('Space', 'single', handleSpacebar);
  useKeys('Enter', 'single', handleEnter);

  const isSundarGutkaOverlay = overlayScreen === 'sunder-gutka';
  const isBaniControllerOverlay = overlayScreen === 'sync-button';
  const isCeremoniesOverlay = overlayScreen === 'ceremonies';
  const isLockScreen = overlayScreen === 'lock-screen';
  const isSettingsOverlay = overlayScreen === 'settings';

  return (
    <>
      <WorkspaceBar />
      <div className={`launchpad${isSingleDisplayMode ? ' single-display misc-pane' : ''}`}>
        <Toolbar />
        {isSundarGutkaOverlay && <SundarGutka onScreenClose={onScreenClose} />}
        {isBaniControllerOverlay && <BaniController onScreenClose={onScreenClose} />}
        {isCeremoniesOverlay && <Ceremonies onScreenClose={onScreenClose} />}
        {isLockScreen && <LockScreen onScreenClose={onScreenClose} />}
        {isSettingsOverlay && <Settings onScreenClose={onScreenClose} />}

        <Navigator />
      </div>
    </>
  );
};

export default Launchpad;
