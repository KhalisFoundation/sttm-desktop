import { useStoreState, useStoreActions } from 'easy-peasy';
import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

import isOnline from 'is-online';
import { ipcRenderer } from 'electron';

import BaniControllerItem from './BaniControllerItem';
import { Overlay } from '../../../common/sttm-ui';

import { getBaniControllerItems, generateQrCode, shareSync } from '../utils';

import { useNewShabad } from '../../../navigator/search/hooks/use-new-shabad';

import QrCode from './QrCode';

import ConnectionSwitch from './ConnectionSwitch';
import ZoomController from './ZoomController';
import useSocketListeners from '../hooks/use-socket-listeners';
import updateMultipane from '../../../navigator/search/utils/update-multipane';
import { setControllerBus, clearControllerBus } from '../controller-bus';

const remote = require('@electron/remote');

const analytics = remote.getGlobal('analytics');
const { tryConnection, onEnd } = shareSync;

const { i18n } = remote.require('./app');

const BaniController = ({ onScreenClose, className }) => {
  const title = 'Mobile device sync';
  const canvasRef = useRef(null);

  const changeActiveShabad = useNewShabad();
  const updatePane = updateMultipane();

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

  // Per-field selectors avoid the easy-peasy proxy-revoked crash that occurs
  // during rapid bani↔shabad transitions when a component subscribes to a
  // whole slice — the cached parent-slice proxy can be revoked between
  // renders, and the next render's `.x` access throws inside Launchpad.
  const activeShabad = useStoreState((state) => state.navigator.activeShabad);
  const activeShabadId = useStoreState((state) => state.navigator.activeShabadId);
  const activeVerseId = useStoreState((state) => state.navigator.activeVerseId);
  const homeVerse = useStoreState((state) => state.navigator.homeVerse);
  const ceremonyId = useStoreState((state) => state.navigator.ceremonyId);
  const sundarGutkaBaniId = useStoreState((state) => state.navigator.sundarGutkaBaniId);
  const isSundarGutkaBani = useStoreState((state) => state.navigator.isSundarGutkaBani);
  const isCeremonyBani = useStoreState((state) => state.navigator.isCeremonyBani);
  const isMiscSlide = useStoreState((state) => state.navigator.isMiscSlide);
  const miscSlideText = useStoreState((state) => state.navigator.miscSlideText);
  const isMiscSlideGurmukhi = useStoreState((state) => state.navigator.isMiscSlideGurmukhi);
  const isAnnouncement = useStoreState((state) => state.navigator.isAnnouncement);
  const savedCrossPlatformId = useStoreState((state) => state.navigator.savedCrossPlatformId);
  const lineNumber = useStoreState((state) => state.navigator.lineNumber);
  const verseHistory = useStoreState((state) => state.navigator.verseHistory);

  const {
    setIsSundarGutkaBani,
    setSundarGutkaBaniId,
    setIsCeremonyBani,
    setCeremonyId,
    setIsMiscSlide,
    setMiscSlideText,
    setIsMiscSlideGurmukhi,
    setIsAnnouncement,
    setSavedCrossPlatformId,
    setLineNumber,
    setVerseHistory,
  } = useStoreActions((state) => state.navigator);

  const gurbaniFontSize = useStoreState((state) => state.userSettings.gurbaniFontSize);
  const content1FontSize = useStoreState((state) => state.userSettings.content1FontSize);
  const content2FontSize = useStoreState((state) => state.userSettings.content2FontSize);
  const content3FontSize = useStoreState((state) => state.userSettings.content3FontSize);
  const baniLength = useStoreState((state) => state.userSettings.baniLength);

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
        // Register the active socket so non-controller mutation sites
        // (save-to-history, HistoryPane delete, MiscFooter clear-all) can
        // broadcast history events without prop-drilling the socket.
        setControllerBus(window.socket, adminPin);
      }
    } else {
      clearControllerBus();
    }
    return () => {
      clearControllerBus();
    };
  }, [isListeners, adminPin]);

  useEffect(() => {
    ipcRenderer.on('bani-controller-data', (event, data) => {
      setSocketData({
        host: 'local-ipc',
        type: data.type,
        ...data,
      });
    });

    return () => {
      ipcRenderer.removeAllListeners('bani-controller-data');
    };
  }, []);

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
      lineNumber,
      setLineNumber,
      updatePane,
      isAnnouncement,
      setIsAnnouncement,
      verseHistory,
      setVerseHistory,
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
