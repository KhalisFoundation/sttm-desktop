import { useStoreActions, useStoreState } from 'easy-peasy';
import insertSlide from '../constants/slidedb';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const analytics = remote.getGlobal('analytics');

export const useSlides = () => {
  const { autoplayToggle, defaultPaneId } = useStoreState((state) => state.userSettings);
  const { setAutoplayToggle } = useStoreActions((state) => state.userSettings);
  const {
    isMiscSlide,
    miscSlideText,
    isAnnouncement,
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
      // `akhandpatt` is deliberately left alone. The viewer already stands a misc
      // slide down over the continuous view, and the setting is written to disk,
      // so clearing it here would end the operator's reading for good instead of
      // interrupting it: they would come back to the slide view and have to find
      // the setting again. Stopping autoplay as well means the reading is paused
      // rather than running on unseen behind the slide.
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
    // The viewer only renders a ceremony when it is not showing a misc slide, so
    // leaving that flag set here would silently swallow the request, which is
    // what happens when this is opened straight after Waheguru or Mool Mantar.
    // Every other route into the viewer clears it the same way.
    if (isMiscSlide) {
      setIsMiscSlide(false);
    }
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
