import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

import { DEFAULT_OVERLAY } from '../../constants';
import Toolbar from '../toolbar';
import { SundarGutkaOverlayDialog, SyncOverlayDialog } from '../bani-controller/overlays';

const Dashboard = () => {
  const { overlayScreen } = useStoreState(state => state.app);
  const { setOverlayScreen } = useStoreActions(actions => actions.app);
  const onDialogClose = () => {
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

export default Dashboard;
