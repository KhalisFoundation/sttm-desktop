// import { remote } from 'electron';
import { useEffect } from 'react';
import { useStoreState } from 'easy-peasy';
import { handleRequestControl, loadBani, loadCeremony } from '../utils';
import { changeFontSize } from '../../../quick-tools-utils';
import { useNewShabad } from '../../../navigator/search/hooks/use-new-shabad';

// const analytics = remote.getGlobal('analytics');

const useSocketListeners = (isListeners, adminPin) => {
  const {
    gurbaniFontSize,
    translationFontSize,
    transliterationFontSize,
    teekaFontSize,
    baniLength,
    mangalPosition,
  } = useStoreState(state => state.userSettings);

  const {
    activeShabad,
    activeShabadId,
    activeVerseId,
    homeVerse,
    ceremonyId,
    sundarGutkaBaniId,
  } = useStoreState(state => state.navigator);

  const changeActiveShabad = useNewShabad();

  const fontSizes = {
    gurbani: parseInt(gurbaniFontSize, 10),
    translation: parseInt(translationFontSize, 10),
    teeka: parseInt(teekaFontSize, 10),
    transliteration: parseInt(transliterationFontSize, 10),
  };

  useEffect(() => {
    console.log('is listening the listeners', isListeners);
    if (isListeners && adminPin) {
      if (isListeners && window.socket !== undefined) {
        window.socket.on('data', data => {
          const isPinCorrect = parseInt(data.pin, 10) === adminPin;
          console.log(data);

          const listenerActions = {
            shabad: payload => {
              // loadShabad(payload.shabadId, payload.verseId, changeActiveShabad);
              if (payload.shabadId !== activeShabadId) {
                changeActiveShabad(payload.shabadId, payload.verseId);
              } else {
                console.log('updateTraversedVerse()');
              }

              // analytics.trackEvent('controller', 'shabad', `${payload.shabadId}`);
            },
            text: payload =>
              global.controller.sendText(payload.text, payload.isGurmukhi, payload.isAnnouncement),
            bani: payload => loadBani(payload.baniId, payload.verseId, payload.lineCount),
            ceremony: payload =>
              loadCeremony(payload.ceremonyId, payload.verseId, payload.lineCount),
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
          if (data.host !== 'sttm-desktop') {
            listenerActions[isPinCorrect ? data.type : 'request-control'](data);
          }
        });
      }
    }
  }, [isListeners, adminPin]);
};

export default useSocketListeners;
