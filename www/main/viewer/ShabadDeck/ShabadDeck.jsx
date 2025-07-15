import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStoreState } from 'easy-peasy';
import { ipcRenderer } from 'electron';

import { Virtuoso } from 'react-virtuoso';
import Slide from '../Slide/Slide';
import QuickTools from '../Slide/QuickTools';
import {
  loadShabadVerse,
  loadBaniVerse,
  loadBani,
  loadCeremony,
  loadShabad,
} from '../../navigator/utils';
import ViewerIcon from '../icons/ViewerIcon';

const os = require('os');
const remote = require('@electron/remote');

const { i18n } = remote.require('./app');
const platform = os.platform();

const themes = require('../../../configs/themes.json');

function ShabadDeck() {
  const {
    activeShabadId,
    activeVerseId,
    isMiscSlide,
    miscSlideText,
    sundarGutkaBaniId,
    isSundarGutkaBani,
    ceremonyId,
    isCeremonyBani,
    minimizedBySingleDisplay,
  } = useStoreState((state) => state.navigator);
  const {
    theme: currentTheme,
    akhandpatt,
    baniLength,
    // mangalPosition,
    displayNextLine,
    themeBg,
    currentWorkspace,
  } = useStoreState((state) => state.userSettings);

  const [activeVerse, setActiveVerse] = useState([]);
  const [nextVerse, setNextVerse] = useState({});
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const PAGE_SIZE = 100;
  const verseRefKeys = useRef([]);

  const observerOptions = {
    root: null,
    rootMargin: '-45% 0px -45% 0px',
    threshold: 1.0,
  };

  const updateVerse = (entries) => {
    const centeredVerses = entries.filter((entry) => entry.isIntersecting);
    if (centeredVerses.length === 0) return;

    if (akhandpatt) {
      const centeredVerse = centeredVerses[0];
      if (centeredVerse) {
        ipcRenderer.send('sync-scroll', centeredVerse.target.dataset.verseid);
      }
    }
  };

  const observer = new IntersectionObserver(updateVerse, observerOptions);

  const baniLengthCols = {
    short: 'existsSGPC',
    medium: 'existsMedium',
    long: 'existsTaksal',
    extralong: 'existsBuddhaDal',
  };

  const verseRefs = useRef({});

  const updateVerseRef = (verseId, ref) => {
    if (ref) {
      verseRefs.current[verseId] = ref;
      if (!verseRefKeys.current.includes(verseId)) {
        verseRefKeys.current = [...verseRefKeys.current, verseId];
      }
      observer.observe(ref);
    }
  };

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

  // Unified verse loading function
  const loadVerses = useCallback(
    async (isAkhandPatt = false) => {
      let verses = [];
      let nextVerseData = {};

      try {
        if (activeVerseId) {
          if (isAkhandPatt) {
            verses = await loadShabad(activeShabadId, activeVerseId);
          } else {
            const result = await loadShabadVerse(activeShabadId, activeVerseId);
            verses = result.length ? [result[0]] : [];

            // Load next line if needed
            if (displayNextLine) {
              const nextResult = await loadShabadVerse(
                activeShabadId,
                activeVerseId,
                displayNextLine,
              );
              nextVerseData = nextResult.length ? nextResult[0] : bakeEmptyVerse();
            }
          }
        }

        if (sundarGutkaBaniId && isSundarGutkaBani) {
          if (isAkhandPatt) {
            verses = await loadBani(sundarGutkaBaniId, baniLengthCols[baniLength]);
          } else {
            const rows = await loadBaniVerse(
              sundarGutkaBaniId,
              activeVerseId,
              baniLengthCols[baniLength],
            );
            verses = rows.length > 1 ? [rows[0]] : rows;

            // Load next line if needed
            if (displayNextLine) {
              const nextRows = await loadBaniVerse(
                sundarGutkaBaniId,
                activeVerseId,
                baniLengthCols[baniLength],
                displayNextLine,
              );
              nextVerseData = nextRows.length === 1 ? nextRows[0] : bakeEmptyVerse();
            }
          }
        }

        if (ceremonyId && isCeremonyBani) {
          const ceremonyVersesArray = await loadCeremony(ceremonyId);
          const ceremonyVerses = ceremonyVersesArray.flat(1);

          const activeCeremonyVerse = ceremonyVerses.filter(
            (verse) => verse && verse.ID === activeVerseId,
          );
          const nextCeremonyVerse = ceremonyVerses.filter(
            (verse) => verse && verse.ID === activeVerseId + 1,
          );

          nextVerseData = nextCeremonyVerse[0] || {};
          verses = isAkhandPatt ? ceremonyVerses : activeCeremonyVerse;
        }

        return { verses, nextVerseData };
      } catch (error) {
        console.error('Error loading verses:', error);
        return { verses: [], nextVerseData: {} };
      }
    },
    [
      activeVerseId,
      activeShabadId,
      sundarGutkaBaniId,
      isSundarGutkaBani,
      baniLength,
      displayNextLine,
      ceremonyId,
      isCeremonyBani,
      baniLengthCols,
      bakeEmptyVerse,
    ],
  );

  // Main effect for loading verses
  useEffect(() => {
    const loadData = async () => {
      const { verses, nextVerseData } = await loadVerses(akhandpatt);

      if (akhandpatt) {
        // For Akhand Patt, load initial page
        setActiveVerse(verses.slice(0, PAGE_SIZE));
        setHasMore(verses.length > PAGE_SIZE);
        setCurrentPage(0);
      } else {
        setActiveVerse(verses);
        setNextVerse(nextVerseData);
      }
    };

    loadData();
  }, [
    activeShabadId,
    activeVerseId,
    sundarGutkaBaniId,
    ceremonyId,
    akhandpatt,
    displayNextLine,
    baniLength,
    isSundarGutkaBani,
    isCeremonyBani,
  ]);

  useEffect(() => {
    if (activeVerseId && akhandpatt) {
      const verseDOM = verseRefs.current[activeVerseId];

      if (verseDOM) {
        verseDOM.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }, [activeVerseId, akhandpatt, verseRefKeys.current, activeVerse.length]); // Changed dependency to activeVerse.length

  useEffect(() => {
    if (isMiscSlide) {
      if (activeVerse.length !== 0) {
        setActiveVerse([]);
      }
    }
  }, [isMiscSlide]);

  // Load more verses for infinite scrolling in Akhand Patt
  const loadMore = useCallback(async () => {
    if (!hasMore || !akhandpatt) return;

    const { verses } = await loadVerses(true);
    const nextPage = currentPage + 1;
    const newVerses = verses.slice(nextPage * PAGE_SIZE, (nextPage + 1) * PAGE_SIZE);

    if (newVerses.length > 0) {
      setActiveVerse((prev) => [...prev, ...newVerses]);
      setCurrentPage(nextPage);
      setHasMore(verses.length > (nextPage + 1) * PAGE_SIZE);
    } else {
      setHasMore(false);
    }
  }, [hasMore, akhandpatt, loadVerses, currentPage, PAGE_SIZE]);

  // Unified verse renderer
  const renderVerse = useCallback(
    (index, verseObj = null) => {
      const verse = verseObj || activeVerse[index];
      if (!verse) return null;

      return (
        <Slide
          key={verse.ID || index}
          verseObj={verse}
          nextLineObj={nextVerse}
          isMiscSlide={isMiscSlide}
          bgColor={applyOverlay()}
          updateVerseRef={updateVerseRef}
        />
      );
    },
    [activeVerse, nextVerse, isMiscSlide, applyOverlay, updateVerseRef],
  );

  // Main render function
  const SlideRender = () => {
    if (akhandpatt && activeVerse.length > 100) {
      return (
        <Virtuoso
          data={activeVerse}
          itemContent={renderVerse}
          overscan={200}
          style={{ height: '100%' }}
          endReached={loadMore}
        />
      );
    }

    if (!activeVerse.length) {
      return <Slide isMiscSlide={isMiscSlide} bgColor={applyOverlay()} />;
    }

    return activeVerse.map((verseObj, index) => renderVerse(index, verseObj));
  };
  return (
    <>
      {themeBg.type === 'video' && (
        <video className="video_preview" src={themeBg.url} autoPlay muted loop />
      )}
      <div
        className={classNames(
          'shabad-deck',
          currentWorkspace === i18n.t('WORKSPACES.SINGLE_DISPLAY') && 'single-display-mode',
          miscSlideText === '' && 'empty-slide',
          minimizedBySingleDisplay && 'single-display-minimized',
          akhandpatt && !isMiscSlide && 'akhandpatt-view',
          platform === 'win32' && 'win32',
          `theme-${getCurrentThemeInstance().key}`,
        )}
        style={applyTheme()}
      >
        {!minimizedBySingleDisplay && <QuickTools isMiscSlide={isMiscSlide} />}
        {SlideRender()}
      </div>
      <ViewerIcon className="viewer-logo" />
    </>
  );
}

export default ShabadDeck;
