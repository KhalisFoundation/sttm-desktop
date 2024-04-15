import { useStoreActions, useStoreState } from 'easy-peasy';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

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
    pane1,
    pane2,
    pane3,
  } = useStoreState((state) => state.navigator);

  const { currentWorkspace } = useStoreState((state) => state.userSettings);

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
    setPane1,
    setPane2,
    setPane3,
  } = useStoreActions((actions) => actions.navigator);

  return (newSelectedShabad, newSelectedVerse, newSearchVerse, multiPaneId = false) => {
    if (currentWorkspace === i18n.t('WORKSPACES.MULTI_PANE')) {
      switch (multiPaneId) {
        case 1:
          setPane1({ ...pane1, activeShabad: newSelectedShabad });
          break;
        case 2:
          setPane2({ ...pane2, activeShabad: newSelectedShabad });
          break;
        case 3:
          setPane3({ ...pane3, activeShabad: newSelectedShabad });
          break;
        default:
          break;
      }
    }

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
      if (currentWorkspace !== i18n.t('WORKSPACES.MULTI_PANE')) {
        setActiveShabadId(newSelectedShabad);
      }

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
