import { useStoreActions, useStoreState } from 'easy-peasy';
import { useEffect } from 'react';
import insertSlide from '../constants/slidedb';

const remote = require('@electron/remote');

const analytics = remote.getGlobal('analytics');

export const useSlides = () => {
  const { akhandpatt } = useStoreState((state) => state.userSettings);
  const { setAkhandpatt } = useStoreActions((state) => state.userSettings);
  const { shortcuts, isMiscSlide, miscSlideText, isAnnoucement, isSundarGutkaBani, isCeremonyBani, ceremonyId } = useStoreState((state) => state.navigator);
  const { setShortcuts, setIsMiscSlide, setMiscSlideText, setIsAnnoucement, setIsSundarGutkaBani, setIsCeremonyBani, setCeremonyId } = useStoreActions((state) => state.navigator);

  const addMiscSlide = (givenText) => {
    if (isAnnoucement) {
      setIsAnnoucement(false);
    }
    if (!isMiscSlide) {
      if (akhandpatt) {
        setAkhandpatt(false);
      }
      setIsMiscSlide(true);
    }
    if (miscSlideText !== givenText) {
      setMiscSlideText(givenText);
    }
  };

  const openWaheguruSlide = ({ openedFrom }) => {
    addMiscSlide(insertSlide.slideStrings.waheguru);
    analytics.trackEvent({
      category: 'display',
      action: 'waheguru-slide',
      label: `Opened from: ${openedFrom}`,
    });
  };

  const openMoolMantraSlide = ({ openedFrom }) => {
    addMiscSlide(insertSlide.slideStrings.moolMantra);
    analytics.trackEvent({
      category: 'display',
      action: 'moool-mantra-slide',
      label: `Opened from: ${openedFrom}`,
    });
  };

  const openBlankViewer = ({ openedFrom }) => {
    addMiscSlide('');
    analytics.trackEvent({
      category: 'display',
      action: 'empty-slide',
      label: `Opened from: ${openedFrom}`,
    });
  };

  const openAnandSahibBhog = ({ openedFrom }) => {
    if (isSundarGutkaBani) {
      setIsSundarGutkaBani(false);
    }
    if (ceremonyId !== 3) {
      setCeremonyId(3);
    }
    if (!isCeremonyBani) {
      setIsCeremonyBani(true);
    }
    analytics.trackEvent({
      category: 'ceremony',
      action: 'anand-sahib-bhog',
      label: `Opened from: ${openedFrom}`,
    });
  };

  useEffect(() => {
    if (shortcuts.openWaheguruSlide) {
      openWaheguruSlide({ openedFrom: 'shortcuts' });
      setShortcuts({
        ...shortcuts,
        openWaheguruSlide: false,
      });
    }
    if (shortcuts.openMoolMantraSlide) {
      openMoolMantraSlide({ openedFrom: 'shortcuts' });
      setShortcuts({
        ...shortcuts,
        openMoolMantraSlide: false,
      });
    }
    if (shortcuts.openBlankViewer) {
      openBlankViewer({ openedFrom: 'shortcuts' });
      setShortcuts({
        ...shortcuts,
        openBlankViewer: false,
      });
    }
    if (shortcuts.openAnandSahibBhog) {
      setShortcuts({
        ...shortcuts,
        openAnandSahibBhog: false,
      });
      openAnandSahibBhog({ openedFrom: 'shortcuts' });
    }
  }, [shortcuts]);

  return {
    openWaheguruSlide,
    openMoolMantraSlide,
    openBlankViewer,
    openAnandSahibBhog
  };
};
