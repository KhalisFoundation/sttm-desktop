import { useStoreActions, useStoreState } from 'easy-peasy';
import insertSlide from '../constants/slidedb';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const analytics = remote.getGlobal('analytics');

export const useSlides = () => {
  // Per-field selectors avoid easy-peasy proxy-revocation crashes during
  // rapid action cascades (e.g. fast bani↔shabad transitions). Subscribing
  // to a whole slice returns a draft proxy that can be revoked mid-tick;
  // subscribing to leaves returns plain values.
  const akhandpatt = useStoreState((state) => state.userSettings.akhandpatt);
  const autoplayToggle = useStoreState((state) => state.userSettings.autoplayToggle);
  const defaultPaneId = useStoreState((state) => state.userSettings.defaultPaneId);
  const { setAkhandpatt, setAutoplayToggle } = useStoreActions((state) => state.userSettings);
  const isMiscSlide = useStoreState((state) => state.navigator.isMiscSlide);
  const miscSlideText = useStoreState((state) => state.navigator.miscSlideText);
  const isAnnouncement = useStoreState((state) => state.navigator.isAnnouncement);
  const isSundarGutkaBani = useStoreState((state) => state.navigator.isSundarGutkaBani);
  const isCeremonyBani = useStoreState((state) => state.navigator.isCeremonyBani);
  const ceremonyId = useStoreState((state) => state.navigator.ceremonyId);
  const pane1 = useStoreState((state) => state.navigator.pane1);
  const pane2 = useStoreState((state) => state.navigator.pane2);
  const pane3 = useStoreState((state) => state.navigator.pane3);
  const {
    setIsMiscSlide,
    setMiscSlideText,
    setIsAnnouncement,
    setIsSundarGutkaBani,
    setIsCeremonyBani,
    setCeremonyId,
    setPane1,
    setPane2,
    setPane3,
  } = useStoreActions((state) => state.navigator);

  const addMiscSlide = (givenText) => {
    if (isAnnouncement) {
      setIsAnnouncement(false);
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
    const currentPane = paneId || defaultPaneId;
    switch (currentPane) {
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
