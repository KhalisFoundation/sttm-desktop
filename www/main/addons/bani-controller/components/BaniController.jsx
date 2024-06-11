import { useStoreState, useStoreActions } from 'easy-peasy';
import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

import isOnline from 'is-online';

import BaniControllerItem from './BaniControllerItem';
import { Overlay } from '../../../common/sttm-ui';

import { getBaniControllerItems, generateQrCode, shareSync } from '../utils';

import { useNewShabad } from '../../../navigator/search/hooks/use-new-shabad';

import QrCode from './QrCode';

import ConnectionSwitch from './ConnectionSwitch';
import ZoomController from './ZoomController';
import useSocketListeners from '../hooks/use-socket-listeners';

const remote = require('@electron/remote');

const analytics = remote.getGlobal('analytics');
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
  const { isListeners, overlayScreen } = useStoreState((state) => state.app);
  const { setOverlayScreen, setListeners } = useStoreActions((actions) => actions.app);

  const { adminPin, code, isConnected } = useStoreState((state) => state.baniController);
  const { setAdminPin, setCode, setConnection } = useStoreActions(
    (actions) => actions.baniController,
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
    isMiscSlide,
    miscSlideText,
    isMiscSlideGurmukhi,
    savedCrossPlatformId,
  } = useStoreState((state) => state.navigator);

  const {
    setIsSundarGutkaBani,
    setSundarGutkaBaniId,
    setIsCeremonyBani,
    setCeremonyId,
    setIsMiscSlide,
    setMiscSlideText,
    setIsMiscSlideGurmukhi,
    setSavedCrossPlatformId,
  } = useStoreActions((state) => state.navigator);

  const {
    gurbaniFontSize,
    content1FontSize,
    content2FontSize,
    content3FontSize,
    baniLength,
    currentWorkspace,
    // mangalPosition,
  } = useStoreState((state) => state.userSettings);

  const fontSizes = {
    gurbani: parseInt(gurbaniFontSize, 10),
    translation: parseInt(content1FontSize, 10),
    teeka: parseInt(content2FontSize, 10),
    transliteration: parseInt(content3FontSize, 10),
  };

  const showSyncError = (errorMessage) => {
    setCodeLabel(errorMessage);
    if (code !== null) {
      setCode(null);
    }
    if (adminPin !== null) {
      setAdminPin(null);
    }
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
        analytics.trackEvent({
          category: 'sync',
          action: 'syncStarted',
        });
      } else {
        showSyncError(i18n.t('TOOLBAR.SYNC_CONTROLLER.CODE_ERR'));
        analytics.trackEvent({
          category: 'sync',
          action: i18n.t('TOOLBAR.SYNC_CONTROLLER.CODE_ERR'),
          label: 'error',
        });
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
      analytics.trackEvent({
        category: 'sync',
        action: 'syncStopped',
      });
    } else {
      await remoteSyncInit();
    }
  };

  const toggleLockScreen = () => {
    if (overlayScreen !== 'lock-screen') {
      setOverlayScreen('lock-screen');
    }
    analytics.trackEvent({
      category: 'sync',
      action: 'lockScreen',
      label: 'lockScreen button clicked',
    });
  };

  useEffect(() => {
    syncToggle(true);
  }, []);

  useEffect(() => {
    if (isListeners && adminPin) {
      if (window.socket !== undefined) {
        window.socket.on('data', (data) => {
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
      // mangalPosition,
      isSundarGutkaBani,
      isCeremonyBani,
      savedCrossPlatformId,
      setIsCeremonyBani,
      setIsSundarGutkaBani,
      setSundarGutkaBaniId,
      setCeremonyId,
      isMiscSlide,
      miscSlideText,
      isMiscSlideGurmukhi,
      setIsMiscSlide,
      setMiscSlideText,
      setIsMiscSlideGurmukhi,
      setSavedCrossPlatformId,
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
                  {currentWorkspace === i18n.t('WORKSPACES.MULTI_PANE') && (
                    <p className="error-msg">
                      <i className="fa-solid fa-triangle-exclamation"></i>
                      <span>Bani controller is not supported in Multi-Pane workspace.</span>
                    </p>
                  )}
                  <div className="sync-code-label">
                    {codeLabel || i18n.t('TOOLBAR.SYNC_CONTROLLER.UNIQUE_CODE_LABEL')}
                  </div>

                  <div className="sync-code-num"> {code || '...'} </div>

                  {baniControllerItems.map((item) => (
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
