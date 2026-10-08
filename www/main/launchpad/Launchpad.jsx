import React, { createContext, useEffect, useRef, useState } from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { ipcRenderer } from 'electron';

import Toolbar from '../toolbar';
import Navigator from '../navigator';
import WorkspaceBar from '../workspace-bar';
import { useKeys, useSlides, useAudioRecorder, useRecordingState } from '../common/hooks';

import {
  Ceremonies,
  SundarGutka,
  BaniController,
  LockScreen,
  AuthDialog,
  Announcement,
  VoiceFollow,
} from '../addons';
import { Settings } from '../settings/';

import { DEFAULT_OVERLAY } from '../common/constants';
import { i18n } from '../common/i18n';

const remote = require('@electron/remote');

const main = remote.require('./app');

const serializeState = (state) => {
  try {
    return JSON.parse(JSON.stringify(state));
  } catch (err) {
    // Never let projection sync crash the main controller UI.
    console.error('[projection] state serialize failed', err);
    return {};
  }
};

export const InputContext = createContext();

const Launchpad = () => {
  const appState = useStoreState((state) => state.app);
  const { overlayScreen } = appState;
  const navigatorState = useStoreState((state) => state.navigator);
  const { shortcuts } = navigatorState;
  const { setShortcuts } = useStoreActions((state) => state.navigator);
  const { setOverlayScreen } = useStoreActions((actions) => actions.app);
  const userSettings = useStoreState((state) => state.userSettings);
  const { currentWorkspace, defaultPaneId } = userSettings;

  const {
    displayWaheguruSlide,
    displayMoolMantraSlide,
    displayBlankViewer,
    displayAnandSahibBhog,
  } = useSlides();

  const ref = useRef();
  const projectionStateRef = useRef();
  projectionStateRef.current = { app: appState, navigator: navigatorState, userSettings };

  const {
    activeShabadId,
    activePaneId,
    activeVerseId,
    isSundarGutkaBani,
    isCeremonyBani,
    sundarGutkaBaniId,
    ceremonyId,
  } = navigatorState;

  useEffect(() => {
    // The startup snapshot is the only full copy Display 2 gets. After that,
    // only scalar settings sync, so a shabad opened in another pane stays on
    // the old list. Push just the live pane fields — a full snapshot revokes
    // the store proxy and crashes the controller.
    const nav = projectionStateRef.current && projectionStateRef.current.navigator;
    if (!nav) return;
    const pane = nav[`pane${nav.activePaneId}`];
    if (!pane || !pane.activeShabad) return;
    ipcRenderer.send(
      'show-line',
      JSON.stringify({
        paneSync: true,
        activePaneId: nav.activePaneId,
        activeShabadId: nav.activeShabadId,
        activeVerseId: nav.activeVerseId,
        isSundarGutkaBani: nav.isSundarGutkaBani,
        isCeremonyBani: nav.isCeremonyBani,
        sundarGutkaBaniId: nav.sundarGutkaBaniId,
        ceremonyId: nav.ceremonyId,
        pane: pane
          ? {
              content: pane.content,
              activeShabad: pane.activeShabad,
              baniType: pane.baniType,
              activeVerse: pane.activeVerse,
              versesRead: pane.versesRead ? [...pane.versesRead] : [],
              homeVerse: pane.homeVerse,
            }
          : null,
      }),
    );
  }, [
    activeShabadId,
    activePaneId,
    activeVerseId,
    isSundarGutkaBani,
    isCeremonyBani,
    sundarGutkaBaniId,
    ceremonyId,
  ]);

  useAudioRecorder();
  const isRecording = useRecordingState();
  const [recordingReady, setRecordingReady] = useState(false);
  const [datasetType, setDatasetType] = useState('kirtan');

  const refreshRecordingSettings = () => {
    ipcRenderer.invoke('get-recording-settings').then((prefs) => {
      setRecordingReady(Boolean(prefs.gurdwaraName) && prefs.hfTokenKhalisSaved);
    });
  };

  useEffect(() => {
    refreshRecordingSettings();
  }, [overlayScreen]);

  useEffect(() => {
    const requestProjectionState = () => {
      ipcRenderer.send('projection-state-response', {
        app: serializeState(projectionStateRef.current.app),
        navigator: serializeState(projectionStateRef.current.navigator),
        userSettings: serializeState(projectionStateRef.current.userSettings),
      });
    };

    ipcRenderer.on('projection-state-request', requestProjectionState);
    return () => ipcRenderer.removeListener('projection-state-request', requestProjectionState);
  }, []);

  const onScreenClose = React.useCallback(
    (evt) => {
      let isFromBackdrop = false;
      if (evt) {
        isFromBackdrop = evt.currentTarget.classList.contains('backdrop');
        const clickdOnEmptySpace = evt.target.classList.contains('addon-wrapper');
        // close only when clicked on empty space in backdrop.
        // Otherwiise keep the add-on screen opened up.
        if (isFromBackdrop && clickdOnEmptySpace) {
          setOverlayScreen(DEFAULT_OVERLAY);
        }
      }
      if (!isFromBackdrop) {
        document.body.classList.toggle(`overlay-${overlayScreen}-active`, false);
        setOverlayScreen(DEFAULT_OVERLAY);
      }
    },
    [overlayScreen, setOverlayScreen, DEFAULT_OVERLAY],
  );

  /** ******************************* */
  /** *******Keyboard Shortcuts****** */
  /** ******************************* */

  // open waheguru slide shortcut
  const handleCtrlPlus1 = () => {
    displayWaheguruSlide({ openedFrom: 'shortcuts' });
  };

  // open mool mantra slide shortcut
  const handleCtrlPlus2 = () => {
    displayMoolMantraSlide({ openedFrom: 'shortcuts' });
  };

  // open blank slide shortcut
  const handleCtrlPlus3 = () => {
    displayBlankViewer({ openedFrom: 'shortcuts' });
  };

  // open anand sahib bhog slide shortcut
  const handleCtrlPlus4 = () => {
    if (currentWorkspace === i18n.t('WORKSPACES.MULTI_PANE')) {
      displayAnandSahibBhog({ openedFrom: 'shortcuts', paneId: defaultPaneId });
    } else {
      displayAnandSahibBhog({ openedFrom: 'shortcuts' });
    }
  };

  const handleCtrlPlus5 = () => {
    main.openSecondaryWindow('helpWindow');
  };

  const handleCtrlPlus6 = () => {
    main.openSecondaryWindow('shortcutLegend');
  };

  // focus on search shabad input shortcut
  const handleCtrlPlusSlash = () => {
    if (!shortcuts.focusInput) {
      setShortcuts({
        ...shortcuts,
        focusInput: true,
      });
    }
  };

  const handleDownAndRight = () => {
    if (!shortcuts.nextVerse && document.activeElement !== ref.current) {
      setShortcuts({
        ...shortcuts,
        nextVerse: true,
      });
    }
  };

  const handleUpAndLeft = () => {
    if (!shortcuts.prevVerse && document.activeElement !== ref.current) {
      setShortcuts({
        ...shortcuts,
        prevVerse: true,
      });
    }
  };

  const handleSpacebar = () => {
    if (!shortcuts.homeVerse && document.activeElement !== ref.current) {
      setShortcuts({
        ...shortcuts,
        homeVerse: true,
      });
    }
  };

  const handleRecordingToggle = () => {
    if (!recordingReady || document.activeElement === ref.current) return;
    ipcRenderer.send('toggle-recording', { datasetType });
  };

  const handleEnter = () => {
    if (!shortcuts.openFirstResult) {
      ref.current.blur();
      setShortcuts({
        ...shortcuts,
        openFirstResult: true,
      });
    }
  };

  const handleCtrlG = () => {
    if (!shortcuts.openDhanGuruSlide) {
      setShortcuts({
        ...shortcuts,
        openDhanGuruSlide: true,
      });
    }
  };

  const handleCtrlC = () => {
    if (!shortcuts.copyToClipboard) {
      setShortcuts({
        ...shortcuts,
        copyToClipboard: true,
      });
    }
  };

  useKeys('Digit1', 'combination', handleCtrlPlus1);
  useKeys('Digit2', 'combination', handleCtrlPlus2);
  useKeys('Digit3', 'combination', handleCtrlPlus3);
  useKeys('Digit4', 'combination', handleCtrlPlus4);
  useKeys('Digit5', 'combination', handleCtrlPlus5);
  useKeys('Digit6', 'combination', handleCtrlPlus6);
  useKeys('Slash', 'combination', handleCtrlPlusSlash);
  useKeys('ArrowDown', 'single', handleDownAndRight);
  useKeys('ArrowRight', 'single', handleDownAndRight);
  useKeys('ArrowUp', 'single', handleUpAndLeft);
  useKeys('ArrowLeft', 'single', handleUpAndLeft);
  useKeys('Space', 'single', handleSpacebar);
  useKeys('KeyR', 'single', handleRecordingToggle);
  useKeys('Enter', 'single', handleEnter);
  useKeys('NumpadEnter', 'single', handleEnter);
  useKeys('KeyG', 'combination', handleCtrlG);
  useKeys('KeyC', 'combination', handleCtrlC);

  const isSundarGutkaOverlay = overlayScreen === 'sunder-gutka';
  const isBaniControllerOverlay = overlayScreen === 'sync-button';
  const isCeremoniesOverlay = overlayScreen === 'ceremonies';
  const isLockScreen = overlayScreen === 'lock-screen';
  const isSettingsOverlay = overlayScreen === 'settings';
  const isAuthDialog = overlayScreen === 'auth-dialog';
  const isAnnouncement = overlayScreen === 'announcement';
  const isVoiceFollowOverlay = overlayScreen === 'voice-follow';
  const isSingleDisplayMode = currentWorkspace === i18n.t('WORKSPACES.SINGLE_DISPLAY');

  return (
    <>
      <WorkspaceBar />
      {recordingReady && (
        <div className="recording-controls">
          <button
            type="button"
            className={`dataset-switch${datasetType === 'kirtan' ? ' kirtan' : ''}`}
            aria-label={`Recording type ${datasetType}`}
            disabled={isRecording}
            onClick={() => setDatasetType(datasetType === 'paath' ? 'kirtan' : 'paath')}
          >
            <span>Paath</span>
            <span>Kirtan</span>
          </button>
          <button
            type="button"
            className={`record-toggle${isRecording ? ' recording' : ''}`}
            aria-label={isRecording ? 'Stop recording' : 'Start recording'}
            title={isRecording ? 'Stop recording' : 'Start recording'}
            onClick={handleRecordingToggle}
          >
            <i className={isRecording ? 'fa fa-stop' : 'fa fa-microphone'} />
          </button>
        </div>
      )}
      <div className={`launchpad${isSingleDisplayMode ? ' single-display misc-pane' : ''}`}>
        <Toolbar />
        {isSundarGutkaOverlay && <SundarGutka onScreenClose={onScreenClose} />}
        <BaniController
          onScreenClose={onScreenClose}
          className={isBaniControllerOverlay ? '' : 'd-none'}
        />
        {isCeremoniesOverlay && <Ceremonies onScreenClose={onScreenClose} />}
        {isLockScreen && <LockScreen onScreenClose={onScreenClose} />}
        <Announcement onScreenClose={onScreenClose} className={isAnnouncement ? '' : 'd-none'} />
        {isSettingsOverlay && <Settings onScreenClose={onScreenClose} />}
        <AuthDialog onScreenClose={onScreenClose} className={isAuthDialog ? '' : 'd-none'} />
        <InputContext.Provider value={ref}>
          <Navigator />
        </InputContext.Provider>
        <VoiceFollow isOpen={isVoiceFollowOverlay} onScreenClose={onScreenClose} />
      </div>
    </>
  );
};

export default Launchpad;
