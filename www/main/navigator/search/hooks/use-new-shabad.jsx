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

  const { currentWorkspace, defaultPaneId } = useStoreState((state) => state.userSettings);

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
    let shabadPane;
    if (currentWorkspace === i18n.t('WORKSPACES.MULTI_PANE')) {
      if (!multiPaneId) {
        const existingPane =
          [pane1, pane2, pane3].findIndex((pane) => pane.activeShabad === newSelectedShabad) + 1;
        if (existingPane > 0) {
          shabadPane = existingPane;
        } else {
          shabadPane = defaultPaneId;
        }
      } else {
        shabadPane = multiPaneId;
      }
      switch (shabadPane) {
        case 1:
          setPane1({
            ...pane1,
            content: i18n.t('MULTI_PANE.SHABAD'),
            activeShabad: newSelectedShabad,
            baniType: 'shabad',
            versesRead: [newSelectedVerse],
            activeVerse: newSelectedVerse,
          });
          break;
        case 2:
          setPane2({
            ...pane2,
            content: i18n.t('MULTI_PANE.SHABAD'),
            activeShabad: newSelectedShabad,
            baniType: 'shabad',
            versesRead: [newSelectedVerse],
            activeVerse: newSelectedVerse,
          });
          break;
        case 3:
          setPane3({
            ...pane3,
            content: i18n.t('MULTI_PANE.SHABAD'),
            activeShabad: newSelectedShabad,
            baniType: 'shabad',
            versesRead: [newSelectedVerse],
            activeVerse: newSelectedVerse,
          });
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
