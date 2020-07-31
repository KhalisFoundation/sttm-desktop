import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

import { DEFAULT_OVERLAY } from '../../constants';

import { Toolbar } from '../toolbar';
import { SundarGutkaOverlayDialog, SyncOverlayDialog } from '../bani-controller/overlays';

export const Dashboard = () => {
  const { overlayScreen } = useStoreState(state => state.app);
  const { setOverlayScreen } = useStoreActions(actions => actions.app);
  const onDialogClose = () => {
    console.log('onDialogClose hit...');
    setOverlayScreen(DEFAULT_OVERLAY);
  };

  const isSundarGutkaOverlay = overlayScreen === 'sunder-gutka';
  const isSyncOverlay = overlayScreen === 'sync-button';

  return (
    <div className="dashboard">
      <Toolbar />
      {isSundarGutkaOverlay && <SundarGutkaOverlayDialog onDialogClose={onDialogClose} />}
      {isSyncOverlay && <SyncOverlayDialog onDialogClose={onDialogClose} />}
    </div>
  );
};
