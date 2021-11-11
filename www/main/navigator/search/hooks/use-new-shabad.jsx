import { useStoreActions, useStoreState } from 'easy-peasy';

export const useNewShabad = () => {
  const {
    verseHistory,
    versesRead,
    isEmptySlide,
    isWaheguruSlide,
    activeShabadId,
    initialVerseId,
    activeVerseId,
    isAnnouncementSlide,
    isMoolMantraSlide,
    isDhanGuruSlide,
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
    setIsSundarGutkaBani,
    setIsCeremonyBani,
  } = useStoreActions(state => state.navigator);

  return (newSelectedShabad, newSelectedVerse, newVerse = '') => {
    const check = verseHistory.filter(historyObj => historyObj.shabadId === newSelectedShabad);
    if (check.length === 0) {
      const updatedHistory = [
        ...verseHistory,
        {
          shabadId: newSelectedShabad,
          verseId: newSelectedVerse,
          label: newVerse,
          type: 'shabad',
          meta: {
            baniLength: '',
          },
          versesRead: [newSelectedVerse],
          continueFrom: newSelectedVerse,
          homeVerse: 0,
        },
      ];
      setVerseHistory(updatedHistory);
    }
    // Push verseId of active Verse to versesRead Array when shabad is changed
    if (!versesRead.includes(newSelectedVerse)) {
      setVersesRead([newSelectedVerse]);
    }
    if (isWaheguruSlide) {
      setIsWaheguruSlide(false);
    }
    if (isAnnouncementSlide) {
      setIsAnnouncementSlide(false);
    }
    if (isEmptySlide) {
      setIsEmptySlide(false);
    }
    if (isMoolMantraSlide) {
      setIsMoolMantraSlide(false);
    }
    if (isDhanGuruSlide) {
      setIsDhanGuruSlide(false);
    }
    if (isSundarGutkaBani) {
      setIsSundarGutkaBani(false);
    }
    if (isCeremonyBani) {
      setIsCeremonyBani(false);
    }

    if (activeShabadId !== newSelectedShabad) {
      setActiveShabadId(newSelectedShabad);

      // initialVerseId is the verse which is stored in history
      // It is the verse we searched for.
      if (initialVerseId !== newSelectedVerse) {
        setInitialVerseId(newSelectedVerse);
      }
    }

    if (newSelectedVerse && activeVerseId !== newSelectedVerse) {
      setActiveVerseId(newSelectedVerse);
    }
    if (window.socket !== undefined && window.socket !== null) {
      window.socket.emit('data', {
        type: 'shabad',
        host: 'sttm-desktop',
        id: newSelectedShabad,
        shabadid: newSelectedShabad, // @deprecated
        highlight: newSelectedVerse,
        homeId: newSelectedVerse,
        verseChange: false,
      });
    }
  };
};
