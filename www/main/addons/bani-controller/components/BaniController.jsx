import { useStoreState, useStoreActions } from 'easy-peasy';
import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { remote } from 'electron';
import isOnline from 'is-online';

import BaniControllerItem from './BaniControllerItem';
import { Overlay } from '../../../common/sttm-ui';
import {
  handleRequestControl,
  loadBani,
  loadCeremony,
  loadShabad,
  getBaniControllerItems,
  generateQrCode,
  shareSync,
} from '../utils';
import { changeFontSize } from '../../../quick-tools-utils';
import { useNewShabad } from '../../../navigator/search/hooks/use-new-shabad';

import QrCode from './QrCode';

import ConnectionSwitch from './ConnectionSwitch';
import ZoomController from './ZoomController';

const { tryConnection, onEnd } = shareSync;

const { i18n } = remote.require('./app');
const analytics = remote.getGlobal('analytics');

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
  } = useStoreState(state => state.navigator);

  const {
    gurbaniFontSize,
    translationFontSize,
    transliterationFontSize,
    teekaFontSize,
    baniLength,
    mangalPosition,
  } = useStoreState(state => state.userSettings);

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

  const fontSizes = {
    gurbani: parseInt(gurbaniFontSize, 10),
    translation: parseInt(translationFontSize, 10),
    teeka: parseInt(teekaFontSize, 10),
    transliteration: parseInt(transliterationFontSize, 10),
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
    console.log('socketData from useEffect inside component', socketData);
    if (socketData) {
      const isPinCorrect = parseInt(socketData.pin, 10) === adminPin;
      const listenerActions = {
        shabad: payload => {
          changeActiveShabad(payload.shabadId, payload.verseId);
          analytics.trackEvent('controller', 'shabad', `${payload.shabadId}`);
        },
        text: payload =>
          global.controller.sendText(payload.text, payload.isGurmukhi, payload.isAnnouncement),
        bani: payload => loadBani(payload.baniId, payload.verseId, payload.lineCount),
        ceremony: payload => loadCeremony(payload.ceremonyId, payload.verseId, payload.lineCount),
        'request-control': () =>
          handleRequestControl(
            adminPin,
            fontSizes,
            activeShabad,
            activeShabadId,
            activeVerseId,
            homeVerse,
            ceremonyId,
            sundarGutkaBaniId,
            baniLength,
            mangalPosition,
          ),
        settings: payload => {
          const { settings } = payload;
          if (settings.action === 'changeFontSize') {
            changeFontSize(settings.target, settings.value === 'plus');
          }
        },
      };
      // if its an event from web and not from desktop itself
      if (socketData.host !== 'sttm-desktop') {
        listenerActions[isPinCorrect ? socketData.type : 'request-control'](socketData);
      }
    }
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
