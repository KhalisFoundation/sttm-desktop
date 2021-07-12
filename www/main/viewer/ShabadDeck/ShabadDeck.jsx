import React, { useState, useEffect } from 'react';
import { useStoreState } from 'easy-peasy';
import Slide from '../Slide/Slide';
import QuickTools from '../Slide/QuickTools';
import {
  loadShabadVerse,
  loadBaniVerse,
  loadBani,
  loadCeremony,
  loadShabad,
} from '../../navigator/utils';

const themes = require('../../../../www/configs/themes.json');

function ShabadDeck() {
  const {
    activeShabadId,
    activeVerseId,
    isEmptySlide,
    isWaheguruSlide,
    isMoolMantraSlide,
    isAnnouncementSlide,
    isDhanGuruSlide,
    sundarGutkaBaniId,
    isSundarGutkaBani,
    ceremonyId,
    isCeremonyBani,
  } = useStoreState(state => state.navigator);
  const {
    theme: currentTheme,
    akhandpatt,
    baniLength,
    mangalPosition,
    displayNextLine,
    isSingleDisplayMode,
  } = useStoreState(state => state.userSettings);
  const [activeVerse, setActiveVerse] = useState([]);
  const [nextVerse, setNextVerse] = useState({});

  const baniLengthCols = {
    short: 'existsSGPC',
    medium: 'existsMedium',
    long: 'existsTaksal',
    extralong: 'existsBuddhaDal',
  };

  const getCurrentThemeInstance = () => {
    return themes.find(theme => theme.key === currentTheme);
  };

  const bakeThemeStyles = themeInstance => {
    const backgroundImageObj = {
      backgroundImage: `url('assets/img/custom_backgrounds/${
        themeInstance['background-image-full']
      }')`,
    };
    const backgroundColorObj = {
      backgroundColor: themeInstance['background-color'],
    };
    return themeInstance['background-image-full'] ? backgroundImageObj : backgroundColorObj;
  };

  const applyTheme = () => {
    const themeInstance = getCurrentThemeInstance();
    return bakeThemeStyles(themeInstance);
  };

  useEffect(() => {
    if (activeVerseId) {
      if (akhandpatt) {
        loadShabad(activeShabadId, activeVerseId).then(verses => setActiveVerse(verses));
      } else {
        loadShabadVerse(activeShabadId, activeVerseId).then(result =>
          result.map(activeRes => setActiveVerse([activeRes])),
        );
        // load next line of searched shabad verse from db
        if (displayNextLine) {
          loadShabadVerse(activeShabadId, activeVerseId, displayNextLine).then(result =>
            result.map(activeRes => setNextVerse(activeRes)),
          );
        }
      }
    }
    if (sundarGutkaBaniId && isSundarGutkaBani) {
      if (akhandpatt) {
        loadBani(sundarGutkaBaniId, baniLengthCols[baniLength], mangalPosition).then(baniRows => {
          setActiveVerse([...baniRows]);
        });
      } else {
        // load current bani verse from db and set in the state
        loadBaniVerse(sundarGutkaBaniId, activeVerseId).then(rows => {
          if (rows.length > 1) {
            setActiveVerse([rows[0]]);
          } else if (rows.length === 1) {
            setActiveVerse([...rows]);
          }
        });
        // load next line of bani
        if (displayNextLine) {
          loadBaniVerse(sundarGutkaBaniId, activeVerseId, displayNextLine).then(rows => {
            if (rows.length > 1) {
              setNextVerse(rows[0]);
            } else if (rows.length === 1) {
              setNextVerse(...rows);
            }
          });
        }
      }
    }
    if (ceremonyId && isCeremonyBani) {
      loadCeremony(ceremonyId).then(ceremonyVerses => {
        const activeCeremonyVerse = ceremonyVerses.filter(ceremonyVerse => {
          if (ceremonyVerse && ceremonyVerse.ID === activeVerseId) {
            return true;
          }
          return false;
        });
        // filters next line of ceremony verse
        const nextCeremonyVerse = ceremonyVerses.filter(ceremonyVerse => {
          return ceremonyVerse && ceremonyVerse.ID === activeVerseId + 1;
        });
        setNextVerse(...nextCeremonyVerse);
        if (akhandpatt) {
          setActiveVerse([...ceremonyVerses]);
        } else {
          setActiveVerse([...activeCeremonyVerse]);
        }
      });
    }
  }, [activeVerseId, sundarGutkaBaniId, ceremonyId, akhandpatt, displayNextLine]);

  return (
    <div
      className={`shabad-deck ${akhandpatt ? 'akhandpatt-view' : ''} ${
        isEmptySlide ? 'empty-slide' : ''
      } theme-${getCurrentThemeInstance().key}`}
      style={applyTheme()}
    >
      {/* show quicktools only on presentation mode */}
      {!isSingleDisplayMode && (
        <QuickTools
          isAnnouncementSlide={isAnnouncementSlide}
          isWaheguruSlide={isWaheguruSlide}
          isMoolMantraSlide={isMoolMantraSlide}
        />
      )}
      {activeVerse.map((activeVerseObj, index) => (
        <Slide
          key={index}
          verseObj={activeVerseObj}
          nextLineObj={nextVerse}
          isWaheguruSlide={isWaheguruSlide}
          isMoolMantraSlide={isMoolMantraSlide}
          isEmptySlide={isEmptySlide}
          isAnnouncementSlide={isAnnouncementSlide}
          isDhanGuruSlide={isDhanGuruSlide}
        />
      ))}
    </div>
  );
}

export default ShabadDeck;
