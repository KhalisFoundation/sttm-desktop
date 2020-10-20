import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

import Toolbar from '../toolbar';
import Navigator from '../navigator';

import { Ceremonies, SundarGutka, BaniController, LockScreen } from '../addons';
import { Settings } from '../settings/';

import { DEFAULT_OVERLAY } from '../common/constants';

const Launchpad = () => {
  const { overlayScreen } = useStoreState(state => state.app);
  const { setOverlayScreen } = useStoreActions(actions => actions.app);

  const onScreenClose = React.useCallback(() => {
    setOverlayScreen(DEFAULT_OVERLAY);
  }, [setOverlayScreen, DEFAULT_OVERLAY]);

  const isSundarGutkaOverlay = overlayScreen === 'sunder-gutka';
  const isBaniControllerOverlay = overlayScreen === 'sync-button';
  const isCeremoniesOverlay = overlayScreen === 'ceremonies';
  const isLockScreen = overlayScreen === 'lock-screen';
  const isSettingsOverlay = overlayScreen === 'settings';

  return (
    <div className="launchpad">
      <Toolbar />
      {isSundarGutkaOverlay && <SundarGutka onScreenClose={onScreenClose} />}
      {isBaniControllerOverlay && <BaniController onScreenClose={onScreenClose} />}
      {isCeremoniesOverlay && <Ceremonies onScreenClose={onScreenClose} />}
      {isLockScreen && <LockScreen onScreenClose={onScreenClose} />}
      {isSettingsOverlay && <Settings onScreenClose={onScreenClose} />}

      <Navigator />
    </div>
  );
};

export default Launchpad;
