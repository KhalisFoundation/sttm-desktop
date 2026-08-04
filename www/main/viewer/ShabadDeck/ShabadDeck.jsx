import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useStoreActions, useStoreState } from 'easy-peasy';

import Slide from '../Slide/Slide';
import QuickTools from '../Slide/QuickTools';

import { loadShabadVerse, loadBaniVerse, loadBani, loadCeremony } from '../../navigator/utils';
import ViewerIcon from '../icons/ViewerIcon';
import PaddingTools from '../Slide/PaddingTools';
import SpacingTools from '../Slide/SpacingTools';
import AutoPlayIcon from '../Slide/AutoPlayIcon';
import { useAkhandpattScroll } from '../akhandpatt/useAkhandpattScroll';
import { buildLayoutRevision } from '../akhandpatt/layout-revision';
import { filterBaniOptions } from './bani-options';
import { BASE_BANI_OPTIONS } from '../../banidb/constants';

const os = require('os');
const remote = require('@electron/remote');

const { i18n } = remote.require('./app');
const platform = os.platform();

const themes = require('../../../configs/themes.json');

function ShabadDeck() {
  const {
    activeShabadId,
    activePaneId,
    activeVerseId,
    verseSelectionNonce,
    isMiscSlide,
    miscSlideText,
    sundarGutkaBaniId,
    isSundarGutkaBani,
    ceremonyId,
    isCeremonyBani,
    minimizedBySingleDisplay,
    pane1,
    pane2,
    pane3,
    filteredBaniOptions,
  } = useStoreState((state) => state.navigator);

  const { setFilteredBaniOptions } = useStoreActions((state) => state.navigator);

  const {
    theme: currentTheme,
    akhandpatt,
    akhandpattScrollSpeed,
    autoplayToggle,
    liveFeed,
    baniLength,
    displayNextLine,
    themeBg,
    currentWorkspace,
    defaultPaneId,
    teekaSource,
    translationEnglishSource,
  } = useStoreState((state) => state.userSettings);
  const { containerPadding, verseSpacing, lineSpacing } = useStoreState(
    (state) => state.viewerSettings,
  );
  // a primitive, so the deck re-renders on a real layout change rather than on
  // every settings tick
  const layoutRevision = useStoreState((state) =>
    buildLayoutRevision(state.userSettings, state.viewerSettings),
  );

  // `akhandpatt` is the operator's chosen view. A misc slide (Mool Mantr,
  // Waheguru, a blank screen) takes the deck over while it is up without
  // changing that choice, so everything that renders, measures or scrolls the
  // continuous view keys off this combined flag instead. Slides are passed the
  // answer, not the two inputs.
  const akhandpattView = akhandpatt && !isMiscSlide;
  const [activeVerse, setActiveVerse] = useState([]);
  const [nextVerse, setNextVerse] = useState({});
  const deckRef = useRef(null);
  // the verses' own wrapper, so the scroll can carry a sub-pixel remainder as a
  // transform on the content. see `useAkhandpattScroll`.
  const deckContentRef = useRef(null);

  const baniLengthCols = {
    short: 'existsSGPC',
    medium: 'existsMedium',
    long: 'existsTaksal',
    extralong: 'existsBuddhaDal',
  };

  const verseRefs = useRef({});
  const lastBaniOptionsRef = useRef(null);
  const autoplayToggleRef = useRef(autoplayToggle);
  autoplayToggleRef.current = autoplayToggle;

  // stable identity, so `React.memo(Slide)` still holds. A fresh closure per
  // render re-rendered every mounted verse on any deck update, and an Akhand
  // Paatth Shabad can have hundreds mounted. `verseRefs` is a ref, so an empty
  // dep list is safe.
  const updateVerseRef = useCallback((verseId, ref) => {
    if (ref) {
      verseRefs.current[verseId] = ref;
    } else {
      // drop pruned verses so the map never measures a detached node, and never
      // grows without bound as the window slides forward
      delete verseRefs.current[verseId];
    }
  }, []);

  const getCurrentThemeInstance = () => themes.find((theme) => theme.key === currentTheme);

  const bakeThemeStyles = (themeInstance, themeObj) => {
    const backgroundImageObj =
      themeObj.type === 'default'
        ? {
            backgroundImage: `url('assets/img/custom_backgrounds/${themeInstance['background-image-full']}')`,
          }
        : {
            backgroundImage: `url('${themeObj.url}')`,
          };
    const backgroundColorObj = {
      backgroundColor: themeInstance['background-color'],
    };
    return themeInstance['background-image-full'] || themeObj.type === 'custom'
      ? backgroundImageObj
      : backgroundColorObj;
  };

  const applyTheme = () => {
    const themeInstance = getCurrentThemeInstance();
    return bakeThemeStyles(themeInstance, themeBg);
  };

  const applyOverlay = () => {
    const themeInstance = getCurrentThemeInstance();
    if (themeBg.type === 'video') {
      return themeInstance['background-color'];
    }
    return '';
  };

  const bakeEmptyVerse = () => ({
    Gurmukhi: '',
    Visraam: '',
  });

  const classNames = (...classes) => classes.filter(Boolean).join(' ');

  const getCurrentShabadId = () => {
    if (activeShabadId) {
      return Number(activeShabadId);
    }
    const activePane = activePaneId || defaultPaneId;
    const paneShabad = { 1: pane1, 2: pane2, 3: pane3 }[activePane]?.activeShabad;
    return paneShabad ? Number(paneShabad) : null;
  };

  const currentShabadId = getCurrentShabadId();
  // a SGGS Shabad in Akhand Paatth view scrolls on into the next Shabad, loaded
  // just in time. banis, ceremonies and misc slides are finite.
  const isInfiniteShabad =
    akhandpattView && !isSundarGutkaBani && !isCeremonyBani && !!activeVerseId && !!currentShabadId;

  useEffect(() => {
    const currentShabad = getCurrentShabadId();
    if (!isMiscSlide && activeVerseId && !akhandpattView) {
      loadShabadVerse(currentShabad, activeVerseId).then((result) =>
        result.map((activeRes) => setActiveVerse([activeRes])),
      );
      // load next line of searched shabad verse from db
      if (displayNextLine && !isMiscSlide) {
        loadShabadVerse(currentShabad, activeVerseId, displayNextLine).then((result) => {
          if (result.length) {
            result.map((activeRes) => setNextVerse(activeRes));
          } else {
            setNextVerse(bakeEmptyVerse());
          }
        });
      }
    }
    // Akhand Paatth Shabad content is owned by useAkhandpattScroll
    if (!isMiscSlide && sundarGutkaBaniId && isSundarGutkaBani) {
      if (akhandpattView) {
        // mangalPosition was removed from 3rd argument of loadBani
        loadBani(sundarGutkaBaniId, baniLengthCols[baniLength]).then((baniRows) => {
          setActiveVerse([...baniRows]);
        });
      } else {
        // load current bani verse from db and set in the state
        loadBaniVerse(
          sundarGutkaBaniId,
          activeVerseId,
          baniLengthCols[baniLength],
          // mangalPosition,
        ).then((rows) => {
          if (rows.length > 1) {
            setActiveVerse([rows[0]]);
          } else if (rows.length === 1) {
            setActiveVerse([...rows]);
          }
        });
        // load next line of bani
        if (displayNextLine && !isMiscSlide) {
          loadBaniVerse(
            sundarGutkaBaniId,
            activeVerseId,
            baniLengthCols[baniLength],
            displayNextLine,
            // mangalPosition,
          ).then((rows) => {
            if (rows.length === 1) {
              setNextVerse(...rows);
            } else {
              setNextVerse(bakeEmptyVerse());
            }
          });
        }
      }
    }
    if (!isMiscSlide && ceremonyId && isCeremonyBani) {
      loadCeremony(ceremonyId).then((ceremonyVersesArray) => {
        let ceremonyVerses;
        try {
          ceremonyVerses = ceremonyVersesArray.flat(1);
        } finally {
          const activeCeremonyVerse = ceremonyVerses.filter((ceremonyVerse) => {
            if (ceremonyVerse && ceremonyVerse.ID === activeVerseId) {
              return true;
            }
            return false;
          });
          // filters next line of ceremony verse
          const nextCeremonyVerse = ceremonyVerses.filter(
            (ceremonyVerse) => ceremonyVerse && ceremonyVerse.ID === activeVerseId + 1,
          );
          setNextVerse(...nextCeremonyVerse);
          if (akhandpattView) {
            setActiveVerse([...ceremonyVerses]);
          } else {
            setActiveVerse([...activeCeremonyVerse]);
          }
        }
      });
    }
  }, [
    activeShabadId,
    activeVerseId,
    sundarGutkaBaniId,
    ceremonyId,
    akhandpatt,
    displayNextLine,
    isMiscSlide,
    pane1,
    pane2,
    pane3,
  ]);

  // the slide view stops autoplay when it runs out of verses (`useSlides`), and
  // a continuous reading does the same when it runs out of Gurbani, so the
  // control returns to "start" instead of claiming to play while nothing moves.
  // both windows detect the end; whichever is second finds the setting already
  // off.
  const handleReadingEnded = useCallback(() => {
    if (!autoplayToggleRef.current) {
      return;
    }
    global.platform.ipc.send(
      'update-global-setting',
      JSON.stringify({
        actionName: 'setAutoplayToggle',
        payload: false,
        settingType: 'userSettings',
      }),
    );
  }, []);

  const { seedState } = useAkhandpattScroll({
    containerRef: deckRef,
    contentRef: deckContentRef,
    verseRefs,
    akhandpatt: akhandpattView,
    viewSuspended: akhandpatt && isMiscSlide,
    infinite: isInfiniteShabad,
    isPlaying: autoplayToggle,
    scrollSpeed: akhandpattScrollSpeed,
    seedShabadId: currentShabadId,
    activeVerseId,
    verseSelectionNonce,
    liveFeed,
    activeVerse,
    setActiveVerse,
    onReadingEnded: handleReadingEnded,
    layoutRevision,
  });

  useEffect(() => {
    if (isMiscSlide) {
      if (activeVerse.length !== 0) {
        setActiveVerse([]);
      }
    }
  }, [isMiscSlide]);

  // the menu depends on the first verse's translations and the two source
  // settings, not on the array holding it. a continuous reading replaces that
  // array on every grow and prune, so depending on the array would re-parse the
  // translations and broadcast to the navigator thousands of times per reading.
  const baniOptionsVerse = activeVerse[0];
  const baniOptions = useMemo(
    () => filterBaniOptions(baniOptionsVerse, teekaSource, translationEnglishSource),
    [baniOptionsVerse, teekaSource, translationEnglishSource],
  );

  useEffect(() => {
    // neighbouring Shabads usually carry the same set of translations, so even a
    // real change of verse mostly leaves the menu identical. compare before
    // sending so the navigator store stays still in that case too.
    const serialised = JSON.stringify(baniOptions);
    if (serialised === lastBaniOptionsRef.current) {
      return;
    }
    lastBaniOptionsRef.current = serialised;
    setFilteredBaniOptions(baniOptions);
    global.platform.ipc.send(
      'update-global-setting',
      JSON.stringify({
        actionName: `setFilteredBaniOptions`,
        payload: baniOptions,
        settingType: 'navigator',
      }),
    );
  }, [baniOptions, setFilteredBaniOptions]);

  // memoise the Slide list so an unrelated userSettings change does not rebuild
  // it. a speed-slider drag round-trips back as `update-viewer-setting` and
  // re-renders this component tens of times a second, and on a long Akhand
  // Paatth Shabad the list is hundreds of elements. with a stable memo the
  // elements are referentially identical and React bails out of the subtree.
  // `updateVerseRef` is useCallback([]) and `nextVerse` changes only when the
  // deck moves on, so this rebuilds on a load, a prune or a misc-slide flip.
  const verseSlides = useMemo(
    () =>
      activeVerse.map((activeVerseObj, index) => (
        <Slide
          key={activeVerseObj?.ID ?? index}
          verseObj={activeVerseObj}
          nextLineObj={nextVerse}
          isMiscSlide={isMiscSlide}
          akhandpattView={akhandpattView}
          updateVerseRef={updateVerseRef}
        />
      )),
    [activeVerse, nextVerse, isMiscSlide, akhandpattView, updateVerseRef],
  );

  // a quick reseed leaves the previous Gurbani up rather than flashing to black.
  // once the seed has stalled that Gurbani belongs to a reading the operator has
  // already left, so cover it and show that the deck is still working.
  const showSeedLoader =
    akhandpattView &&
    (seedState === 'stalled' || (seedState === 'loading' && !activeVerse.length));

  return (
    <>
      {activeVerse.length && akhandpattView ? (
        <AutoPlayIcon
          isSingleDisplay={currentWorkspace === i18n.t('WORKSPACES.SINGLE_DISPLAY')}
          minimizedBySingleDisplay={minimizedBySingleDisplay}
        />
      ) : null}
      {themeBg.type === 'video' && (
        <>
          <video className="video-preview" src={themeBg.url} autoPlay muted loop />
          <div className="video-overlay" style={{ background: applyOverlay() }} />
        </>
      )}
      <div
        ref={deckRef}
        className={classNames(
          'shabad-deck',
          currentWorkspace === i18n.t('WORKSPACES.SINGLE_DISPLAY') && 'single-display-mode',
          miscSlideText === '' && 'empty-slide',
          minimizedBySingleDisplay && 'single-display-minimized',
          akhandpattView && 'akhandpatt-view',
          platform === 'win32' && 'win32',
          `theme-${getCurrentThemeInstance().key}`,
        )}
        style={{
          ...applyTheme(),
          // read by the `.akhandpatt-view` rules in `_verse-slide.scss`, which
          // convert them from reference-design pixels to viewport units. inert
          // outside Akhand Paatth view.
          '--akhandpatt-verse-spacing': verseSpacing,
          '--akhandpatt-line-spacing': lineSpacing,
        }}
      >
        {!minimizedBySingleDisplay && (
          <QuickTools
            isMiscSlide={isMiscSlide}
            baniOptions={filteredBaniOptions.length ? filteredBaniOptions : BASE_BANI_OPTIONS}
          />
        )}
        {!minimizedBySingleDisplay &&
          (akhandpattView ? <SpacingTools /> : <PaddingTools isMiscSlide={isMiscSlide} />)}
        <div
          id="viewer-container-slide-wrapper"
          ref={deckContentRef}
          style={{
            padding: `${containerPadding.top}px ${containerPadding.right}px ${containerPadding.bottom}px ${containerPadding.left}px`,
          }}
        >
          {activeVerse.length ? (
            verseSlides
          ) : (
            <Slide
              isMiscSlide={isMiscSlide}
              akhandpattView={akhandpattView}
              bgColor={applyOverlay()}
            />
          )}
        </div>
        {showSeedLoader && (
          <div className="akhandpatt-loading" aria-live="polite">
            <div className="sttm-loader" />
          </div>
        )}
      </div>
      <ViewerIcon className="viewer-logo" />
    </>
  );
}

export default ShabadDeck;
