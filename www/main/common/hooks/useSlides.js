import { useStoreActions, useStoreState } from 'easy-peasy';
import insertSlide from '../constants/slidedb';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const analytics = remote.getGlobal('analytics');

export const useSlides = () => {
  const { akhandpatt, currentWorkspace, autoplayToggle } = useStoreState(
    (state) => state.userSettings,
  );
  const { setAkhandpatt, setAutoplayToggle } = useStoreActions((state) => state.userSettings);
  const {
    isMiscSlide,
    miscSlideText,
    isAnnoucement,
    isSundarGutkaBani,
    isCeremonyBani,
    ceremonyId,
    pane1,
    pane2,
    pane3,
  } = useStoreState((state) => state.navigator);
  const {
    setIsMiscSlide,
    setMiscSlideText,
    setIsAnnoucement,
    setIsSundarGutkaBani,
    setIsCeremonyBani,
    setCeremonyId,
    setPane1,
    setPane2,
    setPane3,
  } = useStoreActions((state) => state.navigator);

  const addMiscSlide = (givenText) => {
    if (isAnnoucement) {
      setIsAnnoucement(false);
    }
    if (!isMiscSlide) {
      if (akhandpatt) {
        setAkhandpatt(false);
      }
      if (autoplayToggle) {
        setAutoplayToggle(false);
      }
      setIsMiscSlide(true);
    }
    if (miscSlideText !== givenText) {
      setMiscSlideText(givenText);
    }
  };

  const displayWaheguruSlide = ({ openedFrom }) => {
    addMiscSlide(insertSlide.slideStrings.waheguru);
    analytics.trackEvent({
      category: 'display',
      action: 'waheguru-slide',
      label: `Opened from: ${openedFrom}`,
    });
  };

  const displayMoolMantraSlide = ({ openedFrom }) => {
    addMiscSlide(insertSlide.slideStrings.moolMantra);
    analytics.trackEvent({
      category: 'display',
      action: 'moool-mantra-slide',
      label: `Opened from: ${openedFrom}`,
    });
  };

  const displayBlankViewer = ({ openedFrom }) => {
    addMiscSlide('');
    analytics.trackEvent({
      category: 'display',
      action: 'empty-slide',
      label: `Opened from: ${openedFrom}`,
    });
  };

  const displayAnandSahibBhog = ({ openedFrom, paneId = null }) => {
    if (isSundarGutkaBani) {
      setIsSundarGutkaBani(false);
    }
    if (ceremonyId !== 3) {
      setCeremonyId(3);
    }
    if (!isCeremonyBani) {
      setIsCeremonyBani(true);
    }
    if (currentWorkspace === i18n.t('WORKSPACES.MULTI_PANE')) {
      if (paneId) {
        switch (paneId) {
          case 1:
            setPane1({
              ...pane1,
              content: i18n.t('MULTI_PANE.SHABAD'),
              baniType: 'ceremony',
              activeShabad: 3,
            });
            break;
          case 2:
            setPane2({
              ...pane2,
              content: i18n.t('MULTI_PANE.SHABAD'),
              baniType: 'ceremony',
              activeShabad: 3,
            });
            break;
          case 3:
            setPane3({
              ...pane3,
              content: i18n.t('MULTI_PANE.SHABAD'),
              baniType: 'ceremony',
              activeShabad: 3,
            });
            break;
          default:
            break;
        }
      }
    }
    analytics.trackEvent({
      category: 'ceremony',
      action: 'anand-sahib-bhog',
      label: `Opened from: ${openedFrom}`,
    });
  };

  return {
    displayWaheguruSlide,
    displayMoolMantraSlide,
    displayBlankViewer,
    displayAnandSahibBhog,
  };
};
