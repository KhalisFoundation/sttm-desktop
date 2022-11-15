import React from 'react';
import { StoreProvider } from 'easy-peasy';
import { ipcRenderer } from 'electron';

import ShabadDeck from './ShabadDeck/ShabadDeck';
import ViewerState from './store/ViewerState';
import { castToReceiver, appendMessage, requestSession, stopApp, tingle } from './utils';

const chromecast = require('electron-chromecast');
const remote = require("@electron/remote");
const { i18n } = remote.require('./app');

const ViewerApp = () => {
  chromecast((receivers) => {
    return new Promise((resolve, reject) => {
      const modal = new tingle.Modal({
        footer: true,
        stickyFooter: false,
        closeMethods: ['overlay', 'button', 'escape'],
      });

      receivers.forEach((receiver) => {
        const fullName = receiver.service_fullname;
        const blacklist = ['Chromecast-Audio', 'Google-Home', 'Sound-Bar', 'Google-Cast-Group'];
        if (!new RegExp(blacklist.join('|')).test(fullName)) {

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
      const message = receivers.length === 0 ? i18n.t(`CHROMECAST.NO_DEVICES_FOUND`) : i18n.t('CHROMECAST.SELECT_DEVICE');
      modal.setContent('<h2>' + message + '</h2>');
      // add cancel button
      const cancelTitle = receivers.length === 0 ? 'OK' : i18n.t('CHROMECAST.CANCEL');
      modal.addFooterBtn(cancelTitle, 'tingle-btn tingle-btn--pull-right tingle-btn--default', () => {
        modal.close();
      });
      modal.open();
    });
  });

  ipcRenderer.on('search-cast', (event, pos) => {
    requestSession();
    appendMessage(event);
    appendMessage(pos);
  });

  ipcRenderer.on('stop-cast', (event, pos) => {
    stopApp();
  });

  ipcRenderer.on('cast-verse', (event) => {
    castToReceiver();
  });
  return (
    <StoreProvider store={ViewerState}>
      <ShabadDeck />
    </StoreProvider>
  );
};

export default ViewerApp;
