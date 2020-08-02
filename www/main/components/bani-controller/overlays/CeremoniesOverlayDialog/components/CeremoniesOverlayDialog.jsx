import React from 'react';

import CeremonyPane from './CeremonyPane';
import DialogWrapper from '../../DialogWrapper';

const CeremoniesOverlayDialog = ({ onDialogClose }) => {
  return (
    <DialogWrapper onDialogClose={onDialogClose}>
      <div className="ceremonies-dialog-wrapper">
        <div className="ceremonies-list ui-ceremonies">
          <header className="navigator-header ceremonies-header">ceremonies</header>
          <CeremonyPane name="anandkaraj" paneId="anandkaraj" />
        </div>
      </div>
    </DialogWrapper>
  );
};

export default CeremoniesOverlayDialog;
