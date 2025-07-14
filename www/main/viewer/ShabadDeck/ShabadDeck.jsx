import React, { useState, useEffect, useRef } from 'react';
import { useStoreState } from 'easy-peasy';
import { ipcRenderer } from 'electron';

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
  const verseRefKeys = useRef([]);

  const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.8,
  };

  const updateVerse = (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const visibleVerse = entry.target.dataset.verseid;
        ipcRenderer.send('sync-scroll', visibleVerse);
      }
    });
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

  useEffect(() => {
    if (activeVerseId) {
      if (akhandpatt) {
        loadShabad(activeShabadId, activeVerseId).then((verses) => setActiveVerse(verses));
      } else {
        loadShabadVerse(activeShabadId, activeVerseId).then((result) =>
          result.map((activeRes) => setActiveVerse([activeRes])),
        );
        // load next line of searched shabad verse from db
        if (displayNextLine) {
          loadShabadVerse(activeShabadId, activeVerseId, displayNextLine).then((result) => {
            if (result.length) {
              result.map((activeRes) => setNextVerse(activeRes));
            } else {
              setNextVerse(bakeEmptyVerse());
            }
          });
        }
      }
    }
    if (sundarGutkaBaniId && isSundarGutkaBani) {
      if (akhandpatt) {
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
        if (displayNextLine) {
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
    if (ceremonyId && isCeremonyBani) {
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
          if (akhandpatt) {
            setActiveVerse([...ceremonyVerses]);
          } else {
            setActiveVerse([...activeCeremonyVerse]);
          }
        }
      });
    }
  }, [activeShabadId, activeVerseId, sundarGutkaBaniId, ceremonyId, akhandpatt, displayNextLine]);

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
  }, [activeVerseId, akhandpatt, verseRefKeys.current]);

  useEffect(() => {
    if (isMiscSlide) {
      if (activeVerse.length !== 0) {
        setActiveVerse([]);
      }
    }
  }, [isMiscSlide]);
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
        {activeVerse.length ? (
          activeVerse.map((activeVerseObj, index) => (
            <Slide
              key={index}
              verseObj={activeVerseObj}
              nextLineObj={nextVerse}
              isMiscSlide={isMiscSlide}
              bgColor={applyOverlay()}
              updateVerseRef={updateVerseRef}
            />
          ))
        ) : (
          <Slide isMiscSlide={isMiscSlide} bgColor={applyOverlay()} />
        )}
      </div>
      <ViewerIcon className="viewer-logo" />
    </>
  );
}

export default ShabadDeck;
