import React, { useState, useEffect, useRef } from 'react';
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
    isMiscSlide,
    activeVerseId,
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
    setHomeVerse,
    setShortcuts,
    setIsRandomShabad,
    setVerseHistory,
    setIsMiscSlide,
  } = useStoreActions(state => state.navigator);

  const { autoplayToggle, autoplayDelay, baniLength, mangalPosition } = useStoreState(
    state => state.userSettings,
  );

  const [activeShabad, setActiveShabad] = useState([]);
  const [activeVerse, setActiveVerse] = useState({});
  const activeVerseRef = useRef(null);
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
              english: verse.English ? verse.English : '',
              crossPlatformId: verse.crossPlatformID,
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
    if (isMiscSlide) {
      setIsMiscSlide(false);
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

    if (window.socket !== undefined && window.socket !== null) {
      if (isSundarGutkaBani) {
        window.socket.emit('data', {
          host: 'sttm-desktop',
          type: 'bani',
          id: sundarGutkaBaniId,
          shabadid: sundarGutkaBaniId, // @deprecated
          highlight: 0,
          baniLength,
          mangalPosition,
          verseChange: false,
        });
      } else if (isCeremonyBani) {
        window.socket.emit('data', {
          host: 'sttm-desktop',
          type: 'ceremony',
          id: ceremonyId,
          shabadid: ceremonyId, // @deprecated
          highlight: 0,
          verseChange: false,
        });
      } else {
        window.socket.emit('data', {
          type: 'shabad',
          host: 'sttm-desktop',
          id: activeShabadId,
          shabadid: activeShabadId, // @deprecated
          highlight: newTraversedVerse,
          homeId: homeVerse,
          verseChange: false,
        });
      }
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
    try {
      if (homeVerse >= 0) {
        const mappedShabadArray = filterRequiredVerseItems(activeShabad);
        const newVerseIndex = homeVerse;
        const newVerseId = mappedShabadArray[newVerseIndex].verseId;
        updateTraversedVerse(newVerseId, newVerseIndex);
      }
    } catch (e) {
      console.log('Space is not allowed');
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

  const saveToHistory = (verses, verseType, initialVerse = null) => {
    const firstVerse = verses[0];
    let shabadId = firstVerse.Shabads ? firstVerse.Shabads[0].ShabadID : firstVerse.shabadId;
    const verseId = initialVerse || firstVerse.ID;
    let verse;
    if (verseType === 'shabad') {
      if (initialVerse) {
        const clickedVerse = verses.filter(verseObj => {
          return verseObj.ID === initialVerse;
        });
        verse = clickedVerse.length && clickedVerse[0].Gurmukhi;
      } else {
        verse = firstVerse.Gurmukhi;
      }
    } else if (verseType === 'bani') {
      verse = firstVerse.baniName;
      shabadId = firstVerse.baniId;
    } else if (verseType === 'ceremony') {
      verse = firstVerse.ceremonyName;
      shabadId = firstVerse.ceremonyId;
    }
    const check = verseHistory.filter(historyObj => historyObj.shabadId === shabadId);
    if (check.length === 0) {
      const updatedHistory = [
        ...verseHistory,
        {
          shabadId,
          verseId,
          label: verse,
          type: verseType,
          meta: {
            baniLength,
          },
          versesRead: [verseId],
          continueFrom: verseId,
          homeVerse: verseId,
        },
      ];
      setVerseHistory(updatedHistory);
    }
  };

  useEffect(() => {
    if (isSundarGutkaBani && sundarGutkaBaniId) {
      loadBani(sundarGutkaBaniId, baniLengthCols[baniLength], mangalPosition).then(
        sundarGutkaVerses => {
          setActiveShabad(sundarGutkaVerses);
          saveToHistory(sundarGutkaVerses, 'bani');
          openFirstVerse(sundarGutkaVerses[0].ID);
        },
      );
    } else if (isCeremonyBani && ceremonyId) {
      loadCeremony(ceremonyId).then(ceremonyVerses => {
        if (ceremonyVerses) {
          setActiveShabad(ceremonyVerses);
          saveToHistory(ceremonyVerses, 'ceremony');
          openFirstVerse(ceremonyVerses[0].ID);
        }
      });
    } else {
      loadShabad(activeShabadId, initialVerseId).then(verses => {
        if (verses) {
          saveToHistory(verses, 'shabad', initialVerseId);
          setActiveShabad(verses);
          if (isRandomShabad) {
            openFirstVerse(verses[0].ID);
            setIsRandomShabad(false);
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
        changeHomeVerse(initialVerseId);
        // if (homeVerse !== verses.ID) {
        //   setHomeVerse(verses.ID);
        // }
      }
    });

    setTimeout(() => {
      if (activeVerseRef && activeVerseRef.current) {
        activeVerseRef.current.parentNode.scrollTop =
          activeVerseRef.current.offsetTop - activeVerseRef.current.parentNode.offsetTop;
      }
    }, 100);
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
        {filterRequiredVerseItems(activeShabad).map(({ verseId, verse, english }, index) => (
          <ShabadVerse
            key={index}
            activeVerse={activeVerse}
            isHomeVerse={homeVerse}
            lineNumber={index}
            versesRead={versesRead}
            verse={verse}
            englishVerse={english}
            verseId={verseId}
            forwardedRef={activeVerseRef}
            changeHomeVerse={changeHomeVerse}
            updateTraversedVerse={updateTraversedVerse}
          />
        ))}
      </div>
    </div>
  );
};

export default ShabadContent;
