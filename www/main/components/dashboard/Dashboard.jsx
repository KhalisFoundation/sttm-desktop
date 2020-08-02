import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

import Toolbar from '../toolbar';
import {
  // CeremoniesOverlayDialog,
  SundarGutkaOverlayDialog,
  SyncOverlayDialog,
} from '../bani-controller/overlays';

import { DEFAULT_OVERLAY } from '../../constants';

const Dashboard = () => {
  const { overlayScreen } = useStoreState(state => state.app);
  const { setOverlayScreen } = useStoreActions(actions => actions.app);

  const onDialogClose = () => {
    setOverlayScreen(DEFAULT_OVERLAY);
  };

  const isSundarGutkaOverlay = overlayScreen === 'sunder-gutka';
  const isSyncOverlay = overlayScreen === 'sync-button';
  const isCeremoniesOverlay = overlayScreen === 'ceremonies';

  return (
    <div className="dashboard">
      <Toolbar />
      {isSundarGutkaOverlay && <SundarGutkaOverlayDialog onDialogClose={onDialogClose} />}
      {isSyncOverlay && <SyncOverlayDialog onDialogClose={onDialogClose} />}
      {/* {isCeremoniesOverlay && <CeremoniesOverlayDialog onDialogClose={onDialogClose} />} */}
    </div>
  );
};

export default Dashboard;
