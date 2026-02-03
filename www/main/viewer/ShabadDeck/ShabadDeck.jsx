import React, { useState, useEffect, useRef } from 'react';
import { useStoreActions, useStoreState } from 'easy-peasy';

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
import PaddingTools from '../Slide/PaddingTools';
import AutoPlayIcon from '../Slide/AutoPlayIcon';
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
    baniLength,
    displayNextLine,
    themeBg,
    currentWorkspace,
    defaultPaneId,
    teekaSource,
    translationEnglishSource,
  } = useStoreState((state) => state.userSettings);
  const { containerPadding } = useStoreState((state) => state.viewerSettings);
  const [activeVerse, setActiveVerse] = useState([]);
  const [nextVerse, setNextVerse] = useState({});
  const verseRefKeys = useRef([]);

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

  const getFilteredBaniOptions = () => {
    if (!activeVerse.length) return BASE_BANI_OPTIONS;

    const translations = JSON.parse(activeVerse[0].Translations);

    const visibilityMap = {
      'teeka-punjabi': translations?.pu?.[teekaSource]?.length,
      'translation-english': translations?.en?.[translationEnglishSource]?.length,
      'translation-hindi': translations?.hi?.ss?.length,
      'translation-spanish': translations?.es?.sn?.length,
      'transliteration-english': true,
      'transliteration-hindi': true,
    };

    return BASE_BANI_OPTIONS.map((group) => ({
      ...group,
      options: group.options.filter((option) => visibilityMap[option.id]),
    }));
  };

  const classNames = (...classes) => classes.filter(Boolean).join(' ');

  useEffect(() => {
    let currentShabad = activeShabadId;
    if (!currentShabad) {
      const activePane = activePaneId || defaultPaneId;
      if (activePane === 1) {
        currentShabad = pane1.activeShabad;
      } else if (activePane === 2) {
        currentShabad = pane2.activeShabad;
      } else if (activePane === 3) {
        currentShabad = pane3.activeShabad;
      }
    }
    if (!isMiscSlide && activeVerseId) {
      if (akhandpatt) {
        loadShabad(currentShabad, activeVerseId).then((verses) => setActiveVerse(verses));
      } else {
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
    }
    if (!isMiscSlide && sundarGutkaBaniId && isSundarGutkaBani) {
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
          if (akhandpatt) {
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

  useEffect(() => {
    const updatedOptions = getFilteredBaniOptions().filter((option) => option.options.length);
    setFilteredBaniOptions(updatedOptions);
    global.platform.ipc.send(
      'update-global-setting',
      JSON.stringify({
        actionName: `setFilteredBaniOptions`,
        payload: updatedOptions,
        settingType: 'navigator',
      }),
    );
  }, [activeVerse, setFilteredBaniOptions]);

  return (
    <>
      {activeVerse.length && akhandpatt ? <AutoPlayIcon /> : null}
      {themeBg.type === 'video' && (
        <>
          <video className="video-preview" src={themeBg.url} autoPlay muted loop />
          <div className="video-overlay" style={{ background: applyOverlay() }} />
        </>
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
        {!minimizedBySingleDisplay && (
          <QuickTools
            isMiscSlide={isMiscSlide}
            baniOptions={filteredBaniOptions.length ? filteredBaniOptions : BASE_BANI_OPTIONS}
          />
        )}
        {!minimizedBySingleDisplay && !akhandpatt && <PaddingTools isMiscSlide={isMiscSlide} />}
        <div
          id="viewer-container-slide-wrapper"
          style={{
            padding: `${containerPadding.top}px ${containerPadding.right}px ${containerPadding.bottom}px ${containerPadding.left}px`,
          }}
        >
          {activeVerse.length ? (
            activeVerse.map((activeVerseObj, index) => (
              <Slide
                key={index}
                verseObj={activeVerseObj}
                nextLineObj={nextVerse}
                isMiscSlide={isMiscSlide}
                updateVerseRef={updateVerseRef}
                slideIndex={index}
              />
            ))
          ) : (
            <Slide isMiscSlide={isMiscSlide} bgColor={applyOverlay()} />
          )}
        </div>
      </div>
      <ViewerIcon className="viewer-logo" />
    </>
  );
}

export default ShabadDeck;
