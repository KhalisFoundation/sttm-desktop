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
  const { theme: currentTheme, akhandpatt, baniLength, mangalPosition } = useStoreState(
    state => state.userSettings,
  );
  const [activeVerse, setActiveVerse] = useState([]);

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
      }
    }
    if (sundarGutkaBaniId && isSundarGutkaBani) {
      if (akhandpatt) {
        loadBani(sundarGutkaBaniId, baniLengthCols[baniLength], mangalPosition).then(baniRows => {
          setActiveVerse([...baniRows]);
        });
      } else {
        loadBaniVerse(sundarGutkaBaniId, activeVerseId).then(rows => {
          if (rows.length > 1) {
            setActiveVerse([rows[0]]);
          } else if (rows.length === 1) {
            setActiveVerse([...rows]);
          }
        });
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
        if (akhandpatt) {
          setActiveVerse([...ceremonyVerses]);
        } else {
          setActiveVerse([...activeCeremonyVerse]);
        }
      });
    }
  }, [activeVerseId, sundarGutkaBaniId, ceremonyId, akhandpatt]);

  return (
    <div className={`shabad-deck ${akhandpatt ? 'akhandpatt-view' : ''}`} style={applyTheme()}>
      <QuickTools
        isAnnouncementSlide={isAnnouncementSlide}
        isWaheguruSlide={isWaheguruSlide}
        isMoolMantraSlide={isMoolMantraSlide}
      />
      {activeVerse.map((activeVerseObj, index) => (
        <Slide
          key={index}
          verseObj={activeVerseObj}
          isWaheguruSlide={isWaheguruSlide}
          isMoolMantraSlide={isMoolMantraSlide}
          isEmptySlide={isEmptySlide}
          isAnnouncementSlide={isAnnouncementSlide}
          isDhanGuruSlide={isDhanGuruSlide}
          themeStyleObj={getCurrentThemeInstance()}
        />
      ))}
    </div>
  );
}

export default ShabadDeck;
