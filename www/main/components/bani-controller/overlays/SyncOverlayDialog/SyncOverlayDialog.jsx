import React, { useState, useEffect, useRef } from 'react';

import DialogWrapper from '../DialogWrapper';
import SyncItem from './SyncItem';
import { Switch } from '../../../../sttm-ui';

import { getSyncItems, generateQrCode } from './utils';

const SyncOverlayDialog = ({
  onDialogClose,
  title = 'Mobile device sync',
  code = '123',
  adminPin = 1234,
}) => {
  const canvasRef = useRef(null);
  const [isFetchingData, setFetchingData] = useState(false);
  const [isConnectionsDisabled, setConnectionsDisabled] = useState(false);

  useEffect(() => {
    generateQrCode(canvasRef.current, code);
  }, [canvasRef, code]);

  const syncItems = getSyncItems({ code, adminPin });

  return (
    <DialogWrapper onDialogClose={onDialogClose}>
      <div className="sync-dialog-wrapper overlay-ui ui-sync-button">
        <div className="sync-dialog overlay-ui ui-sync-button">
          <header className="sync-header" data-key="MOBILE_DEVICE_SYNC">
            {title}
          </header>
          <div className={`sync-content-wrapper ${isFetchingData ? 'loading' : ''}`}>
            {/* Sync-container */}
            <div className="sync-content">
              {isFetchingData ? (
                <div className="sttm-loader" />
              ) : (
                <>
                  <div className="sync-code-label">
                    {i18n.t('TOOLBAR.SYNC_CONTROLLER.UNIQUE_CODE_LABEL')}
                  </div>

                  <div className="sync-code-num"> ABC_DEF </div>

                  {syncItems.map(item => (
                    <SyncItem key={item.title} {...item} />
                  ))}

                  <div className="connection-switch-container">
                    <p>Disable all the remote connections to SikhiToTheMax</p>
                    <Switch onToggleSwitch={setConnectionsDisabled} />
                  </div>
                </>
              )}
            </div>

            {/* QR-container */}
            <div className="qr-container">
              <div className="qr-desc">{i18n.t('TOOLBAR.QR_CODE.DESC')}</div>
              <canvas ref={canvasRef} className="qr-bani-ctr"></canvas>
              <div className="qr-title">{i18n.t('TOOLBAR.BANI_CONTROLLER')}</div>
            </div>
          </div>
        </div>
      </div>
    </DialogWrapper>
  );
};

export default SyncOverlayDialog;
