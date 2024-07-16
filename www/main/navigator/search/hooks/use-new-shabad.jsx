import { useStoreActions, useStoreState } from 'easy-peasy';
import updateMultipane from '../utils/update-multipane';

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
  } = useStoreActions((actions) => actions.navigator);

  const updatePane = updateMultipane();

  return (newSelectedShabad, newSelectedVerse, newSearchVerse, multiPaneId = false) => {
    updatePane('shabad', newSelectedShabad, newSelectedVerse, multiPaneId);

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
  };
};
