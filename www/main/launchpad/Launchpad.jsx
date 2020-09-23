import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

import Toolbar from '../components/toolbar';
import Navigator from '../components/navigator';

import { Ceremonies, SundarGutka, BaniController, LockScreen } from '../components/addons';

import { DEFAULT_OVERLAY } from '../constants';

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

  return (
    <div className="launchpad">
      <Toolbar />
      {isSundarGutkaOverlay && <SundarGutka onScreenClose={onScreenClose} />}
      {isBaniControllerOverlay && <BaniController onScreenClose={onScreenClose} />}
      {isCeremoniesOverlay && <Ceremonies onScreenClose={onScreenClose} />}
      {isLockScreen && <LockScreen onScreenClose={onScreenClose} />}

      <Navigator />
    </div>
  );
};

export default Launchpad;
