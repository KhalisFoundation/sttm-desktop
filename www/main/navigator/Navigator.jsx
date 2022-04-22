import React, { useEffect } from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { remote } from 'electron';
import SearchPane from './search/components/SearchPane';
import ShabadPane from './shabad/ShabadPane';
import { MiscPane } from './misc/components';
import ViewerPane from './viewer/ViewerPane';
import { Pane } from '../common/sttm-ui/pane';
import { singleDisplayContent, singleDisplayFooter, singleDisplayHeader } from './single-display';
import insertSlide from '../common/constants/slidedb';

const analytics = remote.getGlobal('analytics');

const Navigator = () => {
  const { isSingleDisplayMode, akhandpatt } = useStoreState(state => state.userSettings);
  const { setAkhandpatt } = useStoreState(state => state.userSettings);
  const {
    minimizedBySingleDisplay,
    shortcuts,
    isMiscSlide,
    miscSlideText,
    isAnnoucement,
    isSundarGutkaBani,
    isCeremonyBani,
    ceremonyId,
  } = useStoreState(state => state.navigator);
  const {
    setShortcuts,
    setIsMiscSlide,
    setMiscSlideText,
    setIsAnnoucement,
    setIsSundarGutkaBani,
    setIsCeremonyBani,
    setCeremonyId,
  } = useStoreActions(state => state.navigator);

  const addMiscSlide = givenText => {
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

  const openWaheguruSlide = () => {
    addMiscSlide(insertSlide.slideStrings.waheguru);
    analytics.trackEvent('display', 'waheguru-slide');
  };

  const openMoolMantraSlide = () => {
    addMiscSlide(insertSlide.slideStrings.moolMantra);
    analytics.trackEvent('display', 'mool-mantra-slide');
  };

  const openBlankViewer = () => {
    addMiscSlide('');
    analytics.trackEvent('display', 'empty-slide');
  };

  const openAnandSahibBhog = () => {
    if (isSundarGutkaBani) {
      setIsSundarGutkaBani(false);
    }
    if (ceremonyId !== 3) {
      setCeremonyId(3);
    }
    if (!isCeremonyBani) {
      setIsCeremonyBani(true);
    }
  };

  useEffect(() => {
    if (shortcuts.openWaheguruSlide) {
      openWaheguruSlide();
      setShortcuts({
        ...shortcuts,
        openWaheguruSlide: false,
      });
    }
    if (shortcuts.openMoolMantraSlide) {
      openMoolMantraSlide();
      setShortcuts({
        ...shortcuts,
        openMoolMantraSlide: false,
      });
    }
    if (shortcuts.openBlankViewer) {
      openBlankViewer();
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
      openAnandSahibBhog();
    }
  }, [shortcuts]);

  return (
    <>
      {isSingleDisplayMode ? (
        <>
          <div
            className={`single-display-controller ${
              minimizedBySingleDisplay ? 'single-display-minimize' : 'single-display-maximize'
            }`}
          >
            <Pane
              header={singleDisplayHeader}
              content={singleDisplayContent}
              footer={singleDisplayFooter}
              className="single-display-pane"
            />
          </div>
          <div className="single-display-viewer">
            <ViewerPane />
          </div>
        </>
      ) : (
        <>
          <div className="navigator-row">
            <SearchPane />
            <ShabadPane />
          </div>
          <div className="navigator-row">
            <ViewerPane />
            <MiscPane
              waheguruSlide={openWaheguruSlide}
              moolMantraSlide={openMoolMantraSlide}
              blankSlide={openBlankViewer}
              anandSahibBhog={openAnandSahibBhog}
            />
          </div>
        </>
      )}
    </>
  );
};

export default Navigator;
