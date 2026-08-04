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

const Launchpad = () => {
  const { overlayScreen } = useStoreState((state) => state.app);
  const { shortcuts, isMiscSlide } = useStoreState((state) => state.navigator);
  const { setShortcuts, setIsMiscSlide } = useStoreActions((state) => state.navigator);
  const { setOverlayScreen } = useStoreActions((actions) => actions.app);
  const { currentWorkspace, defaultPaneId, akhandpatt, autoplayToggle } = useStoreState(
    (state) => state.userSettings,
  );
  const { setAutoplayToggle } = useStoreActions((state) => state.userSettings);

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

  // Stepping a verse at a time belongs to the slide view, where the operator
  // advances the Gurbani by hand. A continuous reading advances itself, and the
  // selection an arrow would move is the operator's last explicit click, which
  // the reading has long since scrolled past — stepping it throws the Paatth
  // back to that point. Space still starts and stops the reading, and any line
  // is still one click away in the navigator. This holds while a misc slide
  // covers the deck too: moving the selection behind the slide would only
  // surface as a jump when it came down.
  const canStepVerses = () => !akhandpatt && document.activeElement !== ref.current;

  const handleDownAndRight = () => {
    if (!shortcuts.nextVerse && canStepVerses()) {
      setShortcuts({
        ...shortcuts,
        nextVerse: true,
      });
    }
  };

  const handleUpAndLeft = () => {
    if (!shortcuts.prevVerse && canStepVerses()) {
      setShortcuts({
        ...shortcuts,
        prevVerse: true,
      });
    }
  };

  const handleSpacebar = () => {
    if (akhandpatt) {
      if (overlayScreen !== DEFAULT_OVERLAY) {
        return;
      }
      if (isMiscSlide) {
        // Space is how an operator puts a Quick Insert away without reaching for
        // the mouse. In slide view that runs through the home verse, which also
        // clears the slide; here the reading has its own position, possibly
        // hours from the selected line, so only take the slide down. A second
        // press starts the reading again.
        setIsMiscSlide(false);
      } else {
        setAutoplayToggle(!autoplayToggle);
      }
      return;
    }

    if (!shortcuts.homeVerse) {
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
