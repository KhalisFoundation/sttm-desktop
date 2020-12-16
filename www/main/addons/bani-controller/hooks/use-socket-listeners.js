import { remote } from 'electron';
import { useEffect } from 'react';
import { useStoreState } from 'easy-peasy';
import { handleRequestControl, loadBani, loadCeremony, loadShabad } from '../utils';

const analytics = remote.getGlobal('analytics');

const useSocketListeners = (isListeners, adminPin) => {
  const {
    gurbaniFontSize,
    translationFontSize,
    transliterationFontSize,
    teekaFontSize,
  } = useStoreState(state => state.userSettings);

  const fontSizes = {
    gurbani: parseInt(gurbaniFontSize, 10),
    translation: parseInt(translationFontSize, 10),
    teeka: parseInt(teekaFontSize, 10),
    transliteration: parseInt(transliterationFontSize, 10),
  };

  useEffect(() => {
    if (isListeners && adminPin) {
      if (window.socket !== undefined) {
        window.socket.on('data', data => {
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
            'request-control': () => handleRequestControl(adminPin, fontSizes),
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
