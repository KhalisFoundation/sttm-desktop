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
  const handleCtrlAnd1 = () => {
    console.log('Enter key is pressed');
  };
  useKeys('Digit1', 'combination', handleCtrlAnd1);

  const { overlayScreen } = useStoreState(state => state.app);
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
