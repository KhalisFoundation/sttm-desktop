import { remote } from 'electron';
import { useEffect } from 'react';

const { analytics } = remote.require('./app');

const { handleRequestControl, loadBani, loadCeremony, loadShabad } = '../utils';

const useSocketListeners = (isListeners, adminPin) => {
  useEffect(() => {
    if (isListeners) {
      if (window.socket !== undefined) {
        window.socket.on('data', data => {
          console.log(data, 'DATA IN THE WINDOW. LISTENER');
          const isPinCorrect = parseInt(data.pin, 10) === adminPin;

          const listenerActions = {
            shabad: payload => {
              loadShabad(payload.shabadId, payload.verseId, payload.gurmukhi);
              analytics.trackEvent('controller', 'shabad', `${payload.shabadId}`);
            },
            text: payload =>
              global.controller.sendText(payload.text, payload.isGurmukhi, payload.isAnnouncement),
            bani: payload => loadBani(payload.baniId, payload.verseId, payload.lineCount),
            ceremony: payload =>
              loadCeremony(payload.ceremonyId, payload.verseId, payload.lineCount),
            'request-control': () => handleRequestControl(adminPin),
          };

          // if its an event from web and not from desktop itself
          if (data.host !== 'sttm-desktop') {
            listenerActions[isPinCorrect ? data.type : 'request-control'](data);
          }
        });
      }
    }
  }, [isListeners, adminPin]);
};

export default useSocketListeners;
