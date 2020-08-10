import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

import Toolbar from '../components/toolbar';
import Navigator from '../components/navigator';

import { Ceremonies, SundarGutka, BaniController } from '../components/addons';

import { DEFAULT_OVERLAY } from '../constants';

const Launchpad = () => {
  const { overlayScreen } = useStoreState(state => state.app);
  const { setOverlayScreen } = useStoreActions(actions => actions.app);

  const onScreenClose = () => {
    setOverlayScreen(DEFAULT_OVERLAY);
  };

  const isSundarGutkaOverlay = overlayScreen === 'sunder-gutka';
  const isBaniControllerOverlay = overlayScreen === 'sync-button';
  const isCeremoniesOverlay = overlayScreen === 'ceremonies';

  return (
    <div className="launchpad">
      <Toolbar />
      {isSundarGutkaOverlay && <SundarGutka onScreenClose={onScreenClose} />}
      {isBaniControllerOverlay && <BaniController onScreenClose={onScreenClose} />}
      {isCeremoniesOverlay && <Ceremonies onScreenClose={onScreenClose} />}

      <Navigator />
    </div>
  );
};

export default Launchpad;
