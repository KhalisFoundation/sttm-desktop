import { useStoreState, useStoreActions } from 'easy-peasy';
import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { remote } from 'electron';
import isOnline from 'is-online';

import BaniControllerItem from './BaniControllerItem';
import { Switch, Overlay } from '../../../../sttm-ui';

import { getBaniControllerItems, generateQrCode } from '../utils';
import { tryConnection, onEnd } from '../utils/share-sync';

const { i18n } = remote.require('./app');

const BaniController = ({ onScreenClose }) => {
  const title = 'Mobile device sync';
  const canvasRef = useRef(null);
  const [codeLabel, setCodeLabel] = useState('');
  const [isFetchingCode, setFetchingCode] = useState(false);
  const [isConnectionsDisabled, setConnectionsDisabled] = useState(false);
  const { adminPin, code, isAdminPinVisible, isConnected, isListenersSet } = useStoreState(
    state => state.baniController,
  );
  const { setAdminPin, setCode, setAdminPinVisibility, setConnection } = useStoreActions(
    actions => actions.baniController,
  );

  const showSyncError = errorMessage => {
    setCodeLabel(errorMessage);
    setCode('...');
    setAdminPin('...');
  };

  useEffect(() => {
    const remoteSyncInit = async () => {
      setFetchingCode(true);

      // 1. check onlineValue
      const onlineValue = await isOnline();
      if (onlineValue) {
        const newCode = await tryConnection();

        if (newCode) {
          const newAdminPin =
            adminPin === '...' ? Math.floor(1000 + Math.random() * 8999) : adminPin;

          generateQrCode(canvasRef.current, newCode);
          setAdminPin(newAdminPin);
          setCode(newCode);
        } else {
          showSyncError(i18n.t('TOOLBAR.SYNC_CONTROLLER.CODE_ERR'));
        }
        // set the newCode as our global code
      } else {
        showSyncError(i18n.t('TOOLBAR.SYNC_CONTROLLER.INTERNET_ERR'));
      }

      setFetchingCode(false);
    };

    setListeners();

    if (canvasRef.current) {
      remoteSyncInit();
    }
  }, [canvasRef.current]);

  // useEffect(() => {
  //   generateQrCode(canvasRef.current, code);
  // }, [canvasRef, code]);

  const baniControllerItems = getBaniControllerItems({ code, adminPin });

  return (
    <Overlay onScreenClose={onScreenClose}>
      <div className="sync-wrapper overlay-ui ui-sync-button">
        <div className="sync overlay-ui ui-sync-button">
          <header className="sync-header" data-key="MOBILE_DEVICE_SYNC">
            {title}
          </header>
          <div className={`sync-content-wrapper ${isFetchingCode ? 'loading' : ''}`}>
            {/* Sync-container */}
            <div className="sync-content">
              {isFetchingCode ? (
                <div className="sttm-loader" />
              ) : (
                <>
                  <div className="sync-code-label">
                    {i18n.t('TOOLBAR.SYNC_CONTROLLER.UNIQUE_CODE_LABEL')}
                  </div>

                  <div className="sync-code-num"> {code} </div>

                  {baniControllerItems.map(item => (
                    <BaniControllerItem key={item.title} {...item} />
                  ))}

                  <div className="connection-switch-container">
                    <p>Disable all the remote connections to SikhiToTheMax</p>
                    <Switch
                      controlId="bani-controller"
                      onToggle={setConnectionsDisabled}
                      defaultValue={isConnectionsDisabled}
                    />
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
