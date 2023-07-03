import React, { useEffect } from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';
import SearchPane from './search/components/SearchPane';
import ShabadPane from './shabad/ShabadPane';
import { MiscPane } from './misc/components';
import ViewerPane from './viewer/ViewerPane';
import { Pane } from '../common/sttm-ui/pane';
import { singleDisplayContent, singleDisplayFooter, singleDisplayHeader } from './single-display';
import insertSlide from '../common/constants/slidedb';

const remote = require('@electron/remote');
const analytics = remote.getGlobal('analytics');

const Navigator = () => {
  const { isSingleDisplayMode, akhandpatt } = useStoreState((state) => state.userSettings);
  const { setAkhandpatt } = useStoreState((state) => state.userSettings);
  const {
    minimizedBySingleDisplay,
    shortcuts,
    isMiscSlide,
    miscSlideText,
    isAnnoucement,
    isSundarGutkaBani,
    isCeremonyBani,
    ceremonyId,
  } = useStoreState((state) => state.navigator);
  const {
    setShortcuts,
    setIsMiscSlide,
    setMiscSlideText,
    setIsAnnoucement,
    setIsSundarGutkaBani,
    setIsCeremonyBani,
    setCeremonyId,
  } = useStoreActions((state) => state.navigator);

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
