import React from 'react';
import { StoreProvider } from 'easy-peasy';
import { ipcRenderer } from 'electron';

import ShabadDeck from './ShabadDeck/ShabadDeck';
import ViewerState from './store/ViewerState';
// Deep import, not the `sttm-ui` barrel: this is the only component the
// projection window needs from there, and the barrel's other fourteen exports
// (search results, filter dropdowns, the voice wave) are navigator-only. There
// is no bundler here, so Electron requires the transpiled modules directly and
// importing the barrel would load all fifteen on every projection window open.
import ErrorBoundary from '../common/sttm-ui/error-boundary';
import { castToReceiver, appendMessage, requestSession, stopApp, tingle } from './utils';

const chromecast = require('electron-chromecast');
const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const ViewerApp = () => {
  // Chromecast discovery opens a modal, so it is a side effect and belongs in an
  // effect rather than the render body. Registered once for the window's
  // lifetime: the receiver list is long-lived and re-registering would stack
  // duplicate discovery handlers.
  React.useEffect(() => {
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
  }, []);

  // Registered once for the window's lifetime. A listener added in the render
  // body would be added again on every render and never removed.
  React.useEffect(() => {
    const onSearchCast = (event, pos) => {
      requestSession();
      appendMessage(event);
      appendMessage(pos);
    };
    const onStopCast = () => stopApp();
    const onCastVerse = () => castToReceiver();

    ipcRenderer.on('search-cast', onSearchCast);
    ipcRenderer.on('stop-cast', onStopCast);
    ipcRenderer.on('cast-verse', onCastVerse);

    return () => {
      ipcRenderer.removeListener('search-cast', onSearchCast);
      ipcRenderer.removeListener('stop-cast', onStopCast);
      ipcRenderer.removeListener('cast-verse', onCastVerse);
    };
  }, []);

  return (
    <ErrorBoundary label="viewer">
      <StoreProvider store={ViewerState}>
        <ShabadDeck />
      </StoreProvider>
    </ErrorBoundary>
  );
};

export default ViewerApp;
