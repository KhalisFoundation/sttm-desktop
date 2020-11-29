import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

import Toolbar from '../toolbar';
import Navigator from '../navigator';
import WorkspaceBar from '../workspace-bar';

import { Ceremonies, SundarGutka, BaniController, LockScreen } from '../addons';
import { Settings } from '../settings/';

import { DEFAULT_OVERLAY } from '../common/constants';

const Launchpad = () => {
  const { overlayScreen } = useStoreState(state => state.app);
  const { setOverlayScreen } = useStoreActions(actions => actions.app);

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
        setOverlayScreen(DEFAULT_OVERLAY);
      }
    },
    [setOverlayScreen, DEFAULT_OVERLAY],
  );

  const isSundarGutkaOverlay = overlayScreen === 'sunder-gutka';
  const isBaniControllerOverlay = overlayScreen === 'sync-button';
  const isCeremoniesOverlay = overlayScreen === 'ceremonies';
  const isLockScreen = overlayScreen === 'lock-screen';
  const isSettingsOverlay = overlayScreen === 'settings';

  return (
    <>
      <WorkspaceBar />
      <div className="launchpad">
        <Toolbar />
        {isSundarGutkaOverlay && <SundarGutka onScreenClose={onScreenClose} />}
        {isBaniControllerOverlay && <BaniController onScreenClose={onScreenClose} />}
        {isCeremoniesOverlay && <Ceremonies onScreenClose={onScreenClose} />}
        {isLockScreen && <LockScreen onScreenClose={onScreenClose} />}

        <Navigator />
      </div>
    </>
  );
};

export default Launchpad;
