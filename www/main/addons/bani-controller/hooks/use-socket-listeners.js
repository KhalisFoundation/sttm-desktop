// import { remote } from 'electron';
import { useEffect } from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { handleRequestControl, loadBani, loadCeremony } from '../utils';
import { changeFontSize } from '../../../quick-tools-utils';

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
    verseHistory,
    versesRead,
    isEmptySlide,
    isWaheguruSlide,
    activeShabadId,
    initialVerseId,
    activeVerseId,
    activeShabad,
    homeVerse,
    ceremonyId,
    sundarGutkaBaniId,
    isAnnouncementSlide,
    isMoolMantraSlide,
    isDhanGuruSlide,
    noActiveVerse,
    isSundarGutkaBani,
    isCeremonyBani,
  } = useStoreState(state => state.navigator);

  const {
    setActiveShabadId,
    setInitialVerseId,
    setVerseHistory,
    setVersesRead,
    setActiveVerseId,
    setIsEmptySlide,
    setIsWaheguruSlide,
    setIsMoolMantraSlide,
    setIsAnnouncementSlide,
    setIsDhanGuruSlide,
    setNoActiveVerse,
    setIsSundarGutkaBani,
    setIsCeremonyBani,
  } = useStoreActions(state => state.navigator);

  const changeActiveShabad = (newSelectedShabad, newSelectedVerse, newVerse = '') => {
    // const check = verseHistory.filter(historyObj => historyObj.shabadId === newSelectedShabad);
    // if (check.length === 0) {
    //   const updatedHistory = [
    //     ...verseHistory,
    //     {
    //       shabadId: newSelectedShabad,
    //       verseId: newSelectedVerse,
    //       label: newVerse,
    //       type: 'shabad',
    //       meta: {
    //         baniLength: '',
    //       },
    //       versesRead: [newSelectedVerse],
    //       continueFrom: newSelectedVerse,
    //       homeVerse: 0,
    //     },
    //   ];
    //   setVerseHistory(updatedHistory);
    // }
    // // Push verseId of active Verse to versesRead Array when shabad is changed
    // if (!versesRead.includes(newSelectedVerse)) {
    //   setVersesRead([newSelectedVerse]);
    // }
    // if (isWaheguruSlide) {
    //   setIsWaheguruSlide(false);
    // }
    // if (isAnnouncementSlide) {
    //   setIsAnnouncementSlide(false);
    // }
    // if (isEmptySlide) {
    //   setIsEmptySlide(false);
    // }
    // if (isMoolMantraSlide) {
    //   setIsMoolMantraSlide(false);
    // }
    // if (isDhanGuruSlide) {
    //   setIsDhanGuruSlide(false);
    // }
    // if (isSundarGutkaBani) {
    //   setIsSundarGutkaBani(false);
    // }
    // if (isCeremonyBani) {
    //   setIsCeremonyBani(false);
    // }
    if (activeShabadId !== newSelectedShabad) {
      console.log('socket listener active shabad check');
      console.log(activeShabadId, newSelectedShabad);
      setActiveShabadId(newSelectedShabad);
    }
    if (initialVerseId !== newSelectedVerse) {
      setInitialVerseId(newSelectedVerse);
    }
    if (activeVerseId !== newSelectedVerse) {
      setActiveVerseId(newSelectedVerse);
    }
    // if (noActiveVerse) {
    //   setNoActiveVerse(false);
    // }
    // if (window.socket !== undefined && window.socket !== null) {
    //   window.socket.emit('data', {
    //     type: 'shabad',
    //     host: 'sttm-desktop',
    //     id: newSelectedShabad,
    //     shabadid: newSelectedShabad, // @deprecated
    //     highlight: newSelectedVerse,
    //     homeId: newSelectedVerse,
    //     verseChange: false,
    //   });
    // }
  };

  const fontSizes = {
    gurbani: parseInt(gurbaniFontSize, 10),
    translation: parseInt(translationFontSize, 10),
    teeka: parseInt(teekaFontSize, 10),
    transliteration: parseInt(transliterationFontSize, 10),
  };

  useEffect(() => {
    console.log('inside new use effect in socket listenere', activeShabadId);
  }, [activeShabadId]);

  useEffect(() => {
    if (isListeners && adminPin) {
      if (window.socket !== undefined) {
        window.socket.on('data', data => {
          const isPinCorrect = parseInt(data.pin, 10) === adminPin;
          console.log(data);

          console.log('inside socket even code in socket listener', activeShabadId);

          const listenerActions = {
            shabad: payload => {
              // loadShabad(payload.shabadId, payload.verseId, changeActiveShabad);

              changeActiveShabad(payload.shabadId, payload.verseId);

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
