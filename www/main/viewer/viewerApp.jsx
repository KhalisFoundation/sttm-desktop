import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { StoreProvider, useStoreState } from 'easy-peasy';
import { ipcRenderer } from 'electron';

import ShabadDeck from './ShabadDeck/ShabadDeck';
import ViewerState from './store/ViewerState';
import ErrorBoundary from '../common/ErrorBoundary';
import ShabadPane from '../navigator/shabad/ShabadPane';
import { castToReceiver, appendMessage, requestSession, stopApp, tingle } from './utils';

const chromecast = require('electron-chromecast');
const remote = require('@electron/remote');

const { i18n } = remote.require('./app');
const isPaneProjection = new URLSearchParams(window.location.search).has('paneProjection');

/** Letterbox shells: match live .pane chrome so contain-scale edges aren't theme bands. */
const syncProjectionShellBackground = (screenEl) => {
  if (!screenEl || typeof window === 'undefined') return;
  const pane =
    screenEl.querySelector('.pane-projection-stage .pane') ||
    screenEl.querySelector('.pane-projection-stage .shabad-pane') ||
    screenEl.querySelector('.pane-projection-stage .pane-content');
  if (!pane) return;
  const { backgroundColor } = window.getComputedStyle(pane);
  if (
    !backgroundColor ||
    backgroundColor === 'rgba(0, 0, 0, 0)' ||
    backgroundColor === 'transparent'
  ) {
    return;
  }
  const { body, documentElement } = document;
  documentElement.style.backgroundColor = backgroundColor;
  body.style.backgroundColor = backgroundColor;
  screenEl.style.backgroundColor = backgroundColor;
};

const PaneProjection = () => {
  const projectionReady = useStoreState((state) => state.projection.ready);
  const paneWidth = useStoreState((state) => state.projection.width);
  const paneHeight = useStoreState((state) => state.projection.height);
  const { currentWorkspace, theme, defaultPaneId } = useStoreState((state) => state.userSettings);
  const activePaneId = useStoreState((state) => state.navigator.activePaneId);
  const [screenSize, setScreenSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const screenRef = useRef(null);

  useEffect(() => {
    ipcRenderer.send('projection-render-state', {
      ready: projectionReady,
      paneWidth,
      paneHeight,
      currentWorkspace,
      location: window.location.href,
    });
  }, [currentWorkspace, paneHeight, paneWidth, projectionReady]);

  useEffect(() => {
    const updateScreenSize = () => {
      setScreenSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', updateScreenSize);
    return () => window.removeEventListener('resize', updateScreenSize);
  }, []);

  useEffect(() => {
    if (projectionReady) return undefined;
    const requestProjectionState = () => ipcRenderer.send('projection-state-request');
    requestProjectionState();
    const retryTimer = setTimeout(() => {
      if (!ViewerState.getState().projection.ready) requestProjectionState();
    }, 750);
    return () => clearTimeout(retryTimer);
  }, [projectionReady]);

  // Apply theme class on the document so existing theme SCSS (body/html-scoped) applies.
  useEffect(() => {
    if (!theme) return undefined;
    const { body, documentElement } = document;
    const previousBody = Array.from(body.classList).filter((c) => c.startsWith('theme-'));
    const previousHtml = Array.from(documentElement.classList).filter((c) => c.startsWith('theme-'));
    previousBody.forEach((c) => body.classList.remove(c));
    previousHtml.forEach((c) => documentElement.classList.remove(c));
    body.classList.add(`theme-${theme}`);
    documentElement.classList.add(`theme-${theme}`);
    return () => {
      body.classList.remove(`theme-${theme}`);
      documentElement.classList.remove(`theme-${theme}`);
    };
  }, [theme]);

  // After theme + list mount: shell fill = live .pane bg (no fixed white/grey bands).
  useLayoutEffect(() => {
    if (!projectionReady) return undefined;
    const run = () => syncProjectionShellBackground(screenRef.current);
    run();
    const t1 = window.setTimeout(run, 50);
    const t2 = window.setTimeout(run, 250);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [projectionReady, theme, paneWidth, paneHeight, screenSize.width, screenSize.height]);

  if (!projectionReady || !paneWidth || !paneHeight) {
    return <div className={`pane-projection-screen theme-${theme}`} ref={screenRef} />;
  }

  const isMultiPane = currentWorkspace === i18n.t('WORKSPACES.MULTI_PANE');
  // Follow the live controller pane in multi-pane; single-pane uses defaultPaneId.
  const multiPaneId = isMultiPane ? activePaneId || defaultPaneId || 1 : false;

  // In Presentation the source pane is half-width; multi-pane source columns
  // are one-third-width. Use the multi-pane-equivalent width for matching text size.
  const projectionWidth = isMultiPane ? paneWidth : (paneWidth * 2) / 3;

  // Fill the display. Do not lock the stage to the controller pane height:
  // width-fitting a short multi-pane column used to scale that box taller than
  // the screen, and overflow:hidden on the stage clipped the bottom rows with
  // no scroller. Font size still comes from the controller pane width.
  const layoutWidth = projectionWidth > 0 ? projectionWidth : screenSize.width;
  const layoutHeight =
    layoutWidth > 0 ? (screenSize.height * layoutWidth) / screenSize.width : paneHeight;
  const textScale =
    isMultiPane && paneWidth > 0 && paneHeight > 0 && layoutHeight > 0
      ? Math.min(1, paneHeight / layoutHeight)
      : 1;

  return (
    <div className={`pane-projection-screen theme-${theme}`} ref={screenRef}>
      <div
        className="pane-projection-stage"
        style={{
          width: layoutWidth,
          height: layoutHeight,
          transform: `scale(${screenSize.width / layoutWidth})`,
        }}
      >
        <ShabadPane
          key={`projection-pane-${multiPaneId || 'default'}`}
          className=""
          multiPaneId={multiPaneId}
          isProjection
          style={{
            width: '100%',
            height: '100%',
            maxHeight: 'none',
            flex: 'none',
            ['--projection-text-scale']: textScale,
          }}
        />
      </div>
    </div>
  );
};

const ViewerContent = () => (isPaneProjection ? <PaneProjection /> : <ShabadDeck />);

const ViewerApp = () => {
  if (!isPaneProjection) {
    chromecast(
      (receivers) =>
        new Promise((resolve) => {
          const modal = new tingle.Modal({
            footer: true,
            stickyFooter: false,
            closeMethods: ['overlay', 'button', 'escape'],
          });

          receivers.forEach((receiver) => {
            const fullName = receiver.service_fullname;
            const blacklist = ['Chromecast-Audio', 'Google-Home', 'Sound-Bar', 'Google-Cast-Group'];
            if (receiver.friendlyName && !new RegExp(blacklist.join('|')).test(fullName)) {
              modal.addCastBtn(
                receiver.friendlyName,
                'tingle-btn tingle-btn--primary',
                `${receiver.ipAddress}_${receiver.port}`,
                (e) => {
                  if (
                    e.target.getAttribute('data-reciever-id') ===
                    `${receiver.ipAddress}_${receiver.port}`
                  ) {
                    resolve(receiver);
                  }
                  modal.close();
                },
              );
            }
          });
          // set content
          const message =
            receivers.length === 0
              ? i18n.t(`CHROMECAST.NO_DEVICES_FOUND`)
              : i18n.t('CHROMECAST.SELECT_DEVICE');
          modal.setContent(`<h2 class='tingle-heading'>${message}</h2>`);
          // add cancel button
          const cancelTitle = receivers.length === 0 ? 'OK' : i18n.t('CHROMECAST.CANCEL');
          modal.addFooterBtn(
            cancelTitle,
            'tingle-btn tingle-btn--pull-right tingle-btn--default',
            () => {
              modal.close();
            },
          );
          modal.open();
        }),
    );

    ipcRenderer.on('search-cast', (event, pos) => {
      requestSession();
      appendMessage(event);
      appendMessage(pos);
    });

    ipcRenderer.on('stop-cast', () => {
      stopApp();
    });

    ipcRenderer.on('cast-verse', () => {
      castToReceiver();
    });
  }
  return (
    <ErrorBoundary label="viewer-window">
      <StoreProvider store={ViewerState}>
        <ViewerContent />
      </StoreProvider>
    </ErrorBoundary>
  );
};

export default ViewerApp;
