import React, { useState, useEffect } from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { ipcRenderer } from 'electron';

import { loadShabad, loadBani, loadCeremony } from '../utils';
import { ShabadVerse } from '../../common/sttm-ui';

const anvaad = require('anvaad-js');

const ShabadContent = () => {
  const {
    initialVerseId,
    activeShabadId,
    verseHistory,
    versesRead,
    homeVerse,
    isEmptySlide,
    isWaheguruSlide,
    isAnnouncementSlide,
    isMoolMantraSlide,
    isDhanGuruSlide,
    activeVerseId,
    noActiveVerse,
    sundarGutkaBaniId,
    ceremonyId,
    isCeremonyBani,
    isSundarGutkaBani,
    shortcuts,
    isRandomShabad,
  } = useStoreState(state => state.navigator);

  const {
    setVersesRead,
    setActiveVerseId,
    setIsEmptySlide,
    setIsWaheguruSlide,
    setHomeVerse,
    setIsAnnouncementSlide,
    setIsMoolMantraSlide,
    setIsDhanGuruSlide,
    setNoActiveVerse,
    setShortcuts,
    setIsRandomShabad,
  } = useStoreActions(state => state.navigator);

  const { autoplayToggle, autoplayDelay } = useStoreState(state => state.userSettings);

  const { baniLength, mangalPosition } = useStoreState(state => state.userSettings);
  const [activeShabad, setActiveShabad] = useState([]);
  const [activeVerse, setActiveVerse] = useState({});
  const baniLengthCols = {
    short: 'existsSGPC',
    medium: 'existsMedium',
    long: 'existsTaksal',
    extralong: 'existsBuddhaDal',
  };

  const filterRequiredVerseItems = verses => {
    return verses
      ? verses.map((verse, index) => {
          if (verse) {
            return {
              ID: index,
              verseId: verse.ID,
              verse: verse.Gurmukhi,
            };
          }
          return {};
        })
      : [];
  };

  const filterOverlayVerseItems = (verses, verseId = activeVerseId) => {
    if (verses) {
      const currentIndex = verses.findIndex(obj => obj.ID === verseId);
      const currentVerse = verses[currentIndex];
      if (currentVerse) {
        const Line = { ...currentVerse.toJSON() };
        if (Line.Translations) {
          const lineTranslations = JSON.parse(Line.Translations);
          Line.English =
            lineTranslations.en.bdb || lineTranslations.en.ms || lineTranslations.en.ssk;
          Line.Punjabi =
            lineTranslations.pu.bdb ||
            lineTranslations.pu.ss ||
            lineTranslations.pu.ft ||
            lineTranslations.pu.ms;
          Line.Spanish = lineTranslations.es.sn;
          Line.Hindi = (lineTranslations.hi && lineTranslations.hi.ss) || '';
        }
        Line.Transliteration = {
          English: anvaad.translit(Line.Gurmukhi || ''),
          Shahmukhi: anvaad.translit(Line.Gurmukhi || '', 'shahmukhi'),
          Devanagari: anvaad.translit(Line.Gurmukhi || '', 'devnagri'),
        };
        Line.Unicode = anvaad.unicode(Line.Gurmukhi || '');
        return Line;
      }
    }
    return {};
  };

  const updateTraversedVerse = (newTraversedVerse, verseIndex) => {
    if (isWaheguruSlide) {
      setIsWaheguruSlide(false);
    }
    if (isAnnouncementSlide) {
      setIsAnnouncementSlide(false);
    }
    if (isEmptySlide) {
      setIsEmptySlide(false);
    }
    if (isMoolMantraSlide) {
      setIsMoolMantraSlide(false);
    }
    if (isDhanGuruSlide) {
      setIsDhanGuruSlide(false);
    }
    if (noActiveVerse) {
      setNoActiveVerse(false);
    }
    if (!versesRead.some(traversedVerse => traversedVerse === newTraversedVerse)) {
      const currentIndex = verseHistory.findIndex(
        historyObj => historyObj.shabadId === activeShabadId,
      );
      if (verseHistory[currentIndex]) {
        verseHistory[currentIndex].continueFrom = newTraversedVerse;
        verseHistory[currentIndex].versesRead = versesRead;
      }
      setVersesRead([...versesRead, newTraversedVerse]);
    }
    setActiveVerse({ [verseIndex]: newTraversedVerse });
    if (activeVerseId !== newTraversedVerse) {
      setActiveVerseId(newTraversedVerse);
    }
  };

  const openNextVerse = () => {
    if (Object.entries(activeVerse).length !== 0) {
      const mappedShabadArray = filterRequiredVerseItems(activeShabad);
      Object.keys(activeVerse).forEach(activeVerseIndex => {
        if (mappedShabadArray.length - 1 > parseInt(activeVerseIndex, 10)) {
          const newVerseIndex = parseInt(activeVerseIndex, 10) + 1;
          const newVerseId = mappedShabadArray[newVerseIndex].verseId;
          updateTraversedVerse(newVerseId, newVerseIndex);
        }
      });
    }
  };

  const openPrevVerse = () => {
    if (Object.entries(activeVerse).length !== 0) {
      const mappedShabadArray = filterRequiredVerseItems(activeShabad);
      Object.keys(activeVerse).forEach(activeVerseIndex => {
        if (parseInt(activeVerseIndex, 10) > 0) {
          const newVerseIndex = parseInt(activeVerseIndex, 10) - 1;
          const newVerseId = mappedShabadArray[newVerseIndex].verseId;
          updateTraversedVerse(newVerseId, newVerseIndex);
        }
      });
    }
  };

  const openHomeVerse = () => {
    if (homeVerse >= 0) {
      const mappedShabadArray = filterRequiredVerseItems(activeShabad);
      const newVerseIndex = homeVerse;
      const newVerseId = mappedShabadArray[newVerseIndex].verseId;
      updateTraversedVerse(newVerseId, newVerseIndex);
    }
  };

  const changeHomeVerse = verseIndex => {
    if (homeVerse !== verseIndex) {
      const currentIndex = verseHistory.findIndex(
        historyObj => historyObj.shabadId === activeShabadId,
      );
      if (verseHistory[currentIndex]) {
        verseHistory[currentIndex].homeVerse = verseIndex;
      }
      setHomeVerse(verseIndex);
    }
  };

  const openFirstVerse = firstVerse => {
    updateTraversedVerse(firstVerse, 0);
    changeHomeVerse(0);
  };

  useEffect(() => {
    if (isSundarGutkaBani && sundarGutkaBaniId) {
      loadBani(sundarGutkaBaniId, baniLengthCols[baniLength], mangalPosition).then(
        sundarGutkaVerses => {
          setActiveShabad(sundarGutkaVerses);
          openFirstVerse(sundarGutkaVerses[0].ID);
        },
      );
    } else if (isCeremonyBani && ceremonyId) {
      loadCeremony(ceremonyId).then(ceremonyVerses => {
        if (ceremonyVerses) {
          setActiveShabad(ceremonyVerses);
          openFirstVerse(ceremonyVerses[0].ID);
        }
      });
    } else {
      loadShabad(activeShabadId, initialVerseId).then(verses => {
        if (verses) {
          setActiveShabad(verses);
          if (noActiveVerse || isRandomShabad) {
            openFirstVerse(verses[0].ID);
            if (isRandomShabad) {
              setIsRandomShabad(false);
            }
          }
        }
      });
    }
  }, [
    initialVerseId,
    activeShabadId,
    sundarGutkaBaniId,
    ceremonyId,
    baniLength,
    mangalPosition,
    isCeremonyBani,
    isSundarGutkaBani,
  ]);

  useEffect(() => {
    filterRequiredVerseItems(activeShabad).forEach(verses => {
      if (initialVerseId === verses.verseId) {
        setActiveVerse({ [verses.ID]: verses.verseId });
        if (homeVerse !== verses.ID) {
          setHomeVerse(verses.ID);
        }
      }
    });
  }, [activeShabad]);

  useEffect(() => {
    const overlayVerse = filterOverlayVerseItems(activeShabad, activeVerseId);
    ipcRenderer.send('show-line', {
      Line: overlayVerse,
    });
  }, [activeShabad, activeVerseId]);

  // checks if keyboard shortcut is fired then it invokes the function
  useEffect(() => {
    if (shortcuts.nextVerse) {
      openNextVerse();
      setShortcuts({
        ...shortcuts,
        nextVerse: false,
      });
    }
    if (shortcuts.prevVerse) {
      openPrevVerse();
      setShortcuts({
        ...shortcuts,
        prevVerse: false,
      });
    }
    if (shortcuts.homeVerse) {
      openHomeVerse();
      setShortcuts({
        ...shortcuts,
        homeVerse: false,
      });
    }
  }, [shortcuts]);

  useEffect(() => {
    const milisecondsDelay = parseInt(autoplayDelay, 10) * 1000;
    const interval = setInterval(() => {
      if (autoplayToggle) {
        setShortcuts({
          ...shortcuts,
          nextVerse: true,
        });
      }
    }, milisecondsDelay);
    return () => {
      clearInterval(interval);
    };
  }, [autoplayToggle, autoplayDelay]);

  return (
    <div className="shabad-list">
      <div className="verse-block">
        <div className="result-list">
          <ul>
            {filterRequiredVerseItems(activeShabad).map(({ verseId, verse }, index) => (
              <ShabadVerse
                key={index}
                activeVerse={activeVerse}
                isHomeVerse={homeVerse}
                lineNumber={index}
                versesRead={versesRead}
                verse={verse}
                verseId={verseId}
                changeHomeVerse={changeHomeVerse}
                updateTraversedVerse={updateTraversedVerse}
              />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ShabadContent;
