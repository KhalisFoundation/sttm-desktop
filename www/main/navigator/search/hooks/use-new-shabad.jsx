import { useStoreActions, useStoreState } from 'easy-peasy';

export const useNewShabad = () => {
  const {
    versesRead,
    activeShabadId,
    initialVerseId,
    activeVerseId,
    isSundarGutkaBani,
    isCeremonyBani,
    isMiscSlide,
    singleDisplayActiveTab,
    searchVerse,
  } = useStoreState(state => state.navigator);

  const {
    setActiveShabadId,
    setInitialVerseId,
    setVersesRead,
    setActiveVerseId,
    setIsMiscSlide,
    setIsSundarGutkaBani,
    setIsCeremonyBani,
    setSingleDisplayActiveTab,
    setSearchVerse,
  } = useStoreActions(state => state.navigator);

  return (newSelectedShabad, newSelectedVerse, newSearchVerse) => {
    // Push verseId of active Verse to versesRead Array when shabad is changed
    if (singleDisplayActiveTab !== 'shabad') {
      setSingleDisplayActiveTab('shabad');
    }

    if (!versesRead.includes(newSelectedVerse)) {
      setVersesRead([newSelectedVerse]);
    }
    if (isMiscSlide) {
      setIsMiscSlide(false);
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

      if (searchVerse !== newSearchVerse) {
        setSearchVerse(newSearchVerse);
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
