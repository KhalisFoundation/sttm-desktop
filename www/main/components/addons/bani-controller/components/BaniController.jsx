import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { remote } from 'electron';

import BaniControllerItem from './BaniControllerItem';
import { Switch, Overlay } from '../../../../sttm-ui';

import { getBaniControllerItems, generateQrCode } from '../utils';

const { i18n } = remote.require('./app');

const BaniController = ({ onScreenClose, code = 123, adminPin = 1234 }) => {
  const title = 'Mobile device sync';
  const canvasRef = useRef(null);
  const [isFetchingData, setFetchingData] = useState(false);
  const [isConnectionsDisabled, setConnectionsDisabled] = useState(false);

  useEffect(() => {
    generateQrCode(canvasRef.current, code);
  }, [canvasRef, code]);

  const baniControllerItems = getBaniControllerItems({ code, adminPin });

  return (
    <Overlay onScreenClose={onScreenClose}>
      <div className="sync-wrapper overlay-ui ui-sync-button">
        <div className="sync overlay-ui ui-sync-button">
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

                  {baniControllerItems.map(item => (
                    <BaniControllerItem key={item.title} {...item} />
                  ))}

                  <div className="connection-switch-container">
                    <p>Disable all the remote connections to SikhiToTheMax</p>
                    <Switch controlId="bani-controller" onToggle={setConnectionsDisabled} />
                  </div>
                </>
              )}
            </div>

            {/* QR-container */}
            <div className="qr-container">
              <div className="qr-desc">{i18n.t('TOOLBAR.QR_CODE.DESC')}</div>
              <canvas ref={canvasRef} className="qr-bani-ctr" />
              <div className="qr-title">{i18n.t('TOOLBAR.BANI_CONTROLLER')}</div>
            </div>
          </div>
        </div>
      </div>
    </Overlay>
  );
};

BaniController.propTypes = {
  onScreenClose: PropTypes.func,
  code: PropTypes.number,
  adminPin: PropTypes.number,
};

export default BaniController;
