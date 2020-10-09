import { useStoreState, useStoreActions } from 'easy-peasy';
import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { remote } from 'electron';
import isOnline from 'is-online';

import useSocketListeners from '../hooks/use-socket-listeners';
import BaniControllerItem from './BaniControllerItem';
import { Switch, Overlay } from '../../../../sttm-ui';

import { getBaniControllerItems, generateQrCode, shareSync } from '../utils';

const { tryConnection, onEnd } = shareSync;

const { i18n } = remote.require('./app');
const analytics = remote.getGlobal('analytics');

const BaniController = ({ onScreenClose }) => {
  const title = 'Mobile device sync';
  const canvasRef = useRef(null);
  const syncRef = useRef(null);
  // Local State
  const [codeLabel, setCodeLabel] = useState('');
  const [isFetchingCode, setFetchingCode] = useState(false);
  const [isAdminPinVisible, setAdminPinVisibility] = useState(true);
  const [theFirstRun, setTheFirstRun] = useState(true);
  // Store State
  const { isListeners } = useStoreState(state => state.app);
  const { adminPin, code, isConnected } = useStoreState(state => state.baniController);
  const { setAdminPin, setCode, setConnection } = useStoreActions(
    actions => actions.baniController,
  );

  const { overlayScreen } = useStoreState(state => state.app);
  const { setOverlayScreen } = useStoreActions(actions => actions.app);
  const { setListeners } = useStoreActions(actions => actions.app);

  const showSyncError = errorMessage => {
    setCodeLabel(errorMessage);
    setCode(null);
    setAdminPin(null);
  };

  const remoteSyncInit = async () => {
    setFetchingCode(true);

    // 1. check onlineValue
    const onlineValue = await isOnline();
    if (onlineValue) {
      const newCode = await tryConnection();

      if (newCode) {
        const newAdminPin = Math.floor(1000 + Math.random() * 8999);

        setCode(newCode);
        setAdminPin(newAdminPin);

        generateQrCode(canvasRef.current, newCode);

        setConnection(true);
        setListeners(true);
      } else {
        showSyncError(i18n.t('TOOLBAR.SYNC_CONTROLLER.CODE_ERR'));
      }
    } else {
      showSyncError(i18n.t('TOOLBAR.SYNC_CONTROLLER.INTERNET_ERR'));
    }

    setFetchingCode(false);
  };

  const syncToggle = async (forceConnect = false) => {
    if (isConnected && !forceConnect) {
      // TODO: Needs to remove this DOM interaction
      document.body.classList.remove('controller-on');
      setListeners(false);
      setConnection(false);
      onEnd(code);
      setCode(null);
      setAdminPin(null);
      analytics.trackEvent('syncStopped', true);
    } else {
      await remoteSyncInit();
    }
  };

  const toggleLockScreen = () => {
    if (overlayScreen !== 'lock-screen') {
      setOverlayScreen('lock-screen');
    }
  };

  useEffect(() => {
    if (theFirstRun) {
      syncToggle(true);
      setTheFirstRun(false);
    }
  });

  useSocketListeners(isListeners, adminPin);

  const baniControllerItems = getBaniControllerItems({
    code,
    adminPin,
    isAdminPinVisible,
    setAdminPinVisibility,
    toggleLockScreen,
  });

  return (
    <Overlay onScreenClose={onScreenClose}>
      <div className="sync-wrapper overlay-ui ui-sync-button" ref={syncRef}>
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
                    {codeLabel || i18n.t('TOOLBAR.SYNC_CONTROLLER.UNIQUE_CODE_LABEL')}
                  </div>

                  <div className="sync-code-num"> {code || '...'} </div>

                  {baniControllerItems.map(item => (
                    <BaniControllerItem key={item.title} {...item} />
                  ))}

                  <div className="connection-switch-container">
                    <p>Disable all the remote connections to SikhiToTheMax</p>
                    <Switch
                      controlId="bani-controller"
                      onToggle={() => {
                        syncToggle();
                        analytics.trackEvent(
                          'controller',
                          'connection',
                          isConnected ? 'Enabled' : 'Disabled',
                        );
                      }}
                      defaultValue={!isConnected}
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
