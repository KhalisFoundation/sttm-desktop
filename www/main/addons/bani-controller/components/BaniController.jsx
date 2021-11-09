import { useStoreState, useStoreActions } from 'easy-peasy';
import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { remote } from 'electron';
import isOnline from 'is-online';

import BaniControllerItem from './BaniControllerItem';
import { Overlay } from '../../../common/sttm-ui';

import { getBaniControllerItems, generateQrCode, shareSync } from '../utils';

import { useNewShabad } from '../../../navigator/search/hooks/use-new-shabad';

import QrCode from './QrCode';

import ConnectionSwitch from './ConnectionSwitch';
import ZoomController from './ZoomController';
import useSocketListeners from '../hooks/use-socket-listeners';

const { tryConnection, onEnd } = shareSync;

const { i18n } = remote.require('./app');

const BaniController = ({ onScreenClose, className }) => {
  const title = 'Mobile device sync';
  const canvasRef = useRef(null);

  const changeActiveShabad = useNewShabad();

  // Local State
  const [codeLabel, setCodeLabel] = useState('');
  const [isFetchingCode, setFetchingCode] = useState(false);
  const [isAdminPinVisible, setAdminPinVisibility] = useState(true);
  const [socketData, setSocketData] = useState(null);

  // Store State
  const { isListeners, overlayScreen } = useStoreState(state => state.app);
  const { setOverlayScreen, setListeners } = useStoreActions(actions => actions.app);

  const { adminPin, code, isConnected } = useStoreState(state => state.baniController);
  const { setAdminPin, setCode, setConnection } = useStoreActions(
    actions => actions.baniController,
  );

  const {
    activeShabad,
    activeShabadId,
    activeVerseId,
    homeVerse,
    ceremonyId,
    sundarGutkaBaniId,
    isSundarGutkaBani,
    isCeremonyBani,
  } = useStoreState(state => state.navigator);

  const {
    setIsSundarGutkaBani,
    setSundarGutkaBaniId,
    setIsCeremonyBani,
    setCeremonyId,
  } = useStoreActions(state => state.navigator);

  const {
    gurbaniFontSize,
    translationFontSize,
    transliterationFontSize,
    teekaFontSize,
    baniLength,
    mangalPosition,
  } = useStoreState(state => state.userSettings);

  const fontSizes = {
    gurbani: parseInt(gurbaniFontSize, 10),
    translation: parseInt(translationFontSize, 10),
    teeka: parseInt(teekaFontSize, 10),
    transliteration: parseInt(transliterationFontSize, 10),
  };

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
      // analytics.trackEvent('syncStopped', true);
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
    syncToggle(true);
  }, []);

  useEffect(() => {
    if (isListeners && adminPin) {
      if (window.socket !== undefined) {
        window.socket.on('data', data => {
          setSocketData(data);
        });
      }
    }
  }, [isListeners, adminPin]);

  useEffect(() => {
    useSocketListeners(
      socketData,
      changeActiveShabad,
      adminPin,
      activeShabad,
      activeShabadId,
      activeVerseId,
      homeVerse,
      ceremonyId,
      sundarGutkaBaniId,
      fontSizes,
      baniLength,
      mangalPosition,
      isSundarGutkaBani,
      isCeremonyBani,
      setIsCeremonyBani,
      setIsSundarGutkaBani,
      setSundarGutkaBaniId,
      setCeremonyId,
    );
  }, [socketData]);

  const baniControllerItems = getBaniControllerItems({
    code,
    adminPin,
    isAdminPinVisible,
    setAdminPinVisibility,
    toggleLockScreen,
  });

  return (
    <Overlay onScreenClose={onScreenClose} className={className}>
      <div className="addon-wrapper sync-wrapper overlay-ui ui-sync-button">
        <ZoomController />
        <div className="sync overlay-ui ui-sync-button">
          <header className="sync-header" data-key="MOBILE_DEVICE_SYNC">
            {title}
          </header>
          <div className={`sync-content-wrapper ${isFetchingCode ? 'loading' : ''}`}>
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

                  <ConnectionSwitch isConnected={isConnected} syncToggle={syncToggle} />
                </>
              )}
            </div>

            <QrCode canvasRef={canvasRef} />
          </div>
        </div>
      </div>
    </Overlay>
  );
};

BaniController.propTypes = {
  onScreenClose: PropTypes.func,
  className: PropTypes.string,
};

export default BaniController;
