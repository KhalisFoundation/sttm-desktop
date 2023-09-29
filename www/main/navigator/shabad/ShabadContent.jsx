/* eslint-disable import/no-cycle */
/* eslint-disable no-unsafe-finally */
import Noty from 'noty';
import React, { useState, useEffect, useRef } from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { ipcRenderer } from 'electron';

import copy from 'copy-to-clipboard';
import { Virtuoso } from 'react-virtuoso';
import { loadShabad, loadBani, loadCeremony } from '../utils';
import { ShabadVerse } from '../../common/sttm-ui';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

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
    minimizedBySingleDisplay,
    isDontSaveHistory,
    savedCrossPlatformId,
  } = useStoreState((state) => state.navigator);

  const {
    setVersesRead,
    setActiveVerseId,
    setHomeVerse,
    setShortcuts,
    setIsRandomShabad,
    setVerseHistory,
    setIsMiscSlide,
    setIsDontSaveHistory,
    setInitialVerseId,
  } = useStoreActions((state) => state.navigator);

  // mangalPosition was removed from below settings
  const { autoplayToggle, autoplayDelay, baniLength, liveFeed } = useStoreState(
    (state) => state.userSettings,
  );

  const [activeShabad, setActiveShabad] = useState([]);
  const [activeVerse, setActiveVerse] = useState({});
  const [atHome, setHome] = useState(true);
  const [previousVerseIndex, setPreviousIndex] = useState();

  const activeVerseRef = useRef(null);
  const virtuosoRef = useRef(null);
  const baniLengthCols = {
    short: 'existsSGPC',
    medium: 'existsMedium',
    long: 'existsTaksal',
    extralong: 'existsBuddhaDal',
  };

  const scrollToVerse = (verseId) => {
    const verseIndex = activeShabad.findIndex((obj) => obj.ID === verseId);
    virtuosoRef.current.scrollToIndex({
      index: verseIndex,
      behavior: 'smooth',
      align: 'center',
    });
  };

  const skipIkOnkar = (shabadVerses, index) => {
    if (shabadVerses[index]) {
      // eslint-disable-next-line no-unsafe-optional-chaining
      const { verse: gurmukhi } = shabadVerses[index]?.verse;
      const { verseId } = shabadVerses[index];
      if (verseId !== 1 && /^(<>)/gm.test(gurmukhi)) {
        return index + 1;
      }
      return index;
    }
    return 0;
  };

  const filterRequiredVerseItems = (verses) => {
    let versesNew;
    let currentLine = 0;
    try {
      versesNew = verses.flat(1);
    } catch (error) {
      versesNew = verses;
    } finally {
      const checkPauri = versesNew.filter((verse) => /]\d*]/.test(verse.Gurmukhi));
      const regex = checkPauri.length > 1 ? /]\d*]/ : /]/;
      return versesNew
        ? versesNew.map((verse, index) => {
            if (verse) {
              const verseObj = {
                ID: index,
                verseId: verse.ID,
                verse: verse.Gurmukhi,
                english: verse.English ? verse.English : '',
                lineNo: currentLine,
                crossPlatformId: verse.crossPlatformID ? verse.crossPlatformID : '',
              };
              // eslint-disable-next-line no-unused-expressions
              regex.test(verse.Gurmukhi) && currentLine++;
              return verseObj;
            }
            return {};
          })
        : [];
    }
  };

  const [filteredItems, setFilteredItems] = useState(filterRequiredVerseItems(activeShabad));

  const filterOverlayVerseItems = (verses, verseId = activeVerseId) => {
    if (verses) {
      const currentIndex = verses.findIndex((obj) => obj.ID === verseId);
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

  const updateTraversedVerse = (newTraversedVerse, verseIndex, crossPlatformId = null) => {
    if (isMiscSlide) {
      setIsMiscSlide(false);
    }
    let currentShabad;
    if (isSundarGutkaBani) {
      currentShabad = sundarGutkaBaniId;
    } else if (isCeremonyBani) {
      currentShabad = ceremonyId;
    } else {
      currentShabad = activeShabadId;
    }
    const currentIndex = verseHistory.findIndex(
      (historyObj) => historyObj.shabadId === currentShabad,
    );
    if (verseHistory[currentIndex]) {
      verseHistory[currentIndex].continueFrom = newTraversedVerse;
      if (!versesRead.some((traversedVerse) => traversedVerse === newTraversedVerse)) {
        verseHistory[currentIndex].versesRead = [...versesRead, newTraversedVerse];
        setVersesRead([...versesRead, newTraversedVerse]);
      }
    } else {
      // eslint-disable-next-line no-lonely-if
      if (!versesRead.some((traversedVerse) => traversedVerse === newTraversedVerse)) {
        setVersesRead([...versesRead, newTraversedVerse]);
      }
    }
    setActiveVerse({ [verseIndex]: newTraversedVerse });
    if (activeVerseId !== newTraversedVerse) {
      setActiveVerseId(newTraversedVerse);
    }

    if (window.socket !== undefined && window.socket !== null) {
      let baniVerse;
      if (!crossPlatformId) {
        baniVerse = activeShabad.find((obj) => obj.ID === newTraversedVerse);
      }
      if (isSundarGutkaBani) {
        window.socket.emit('data', {
          host: 'sttm-desktop',
          type: 'bani',
          id: sundarGutkaBaniId,
          shabadid: sundarGutkaBaniId, // @deprecated
          highlight: crossPlatformId || baniVerse.crossPlatformID,
          baniLength,
          // mangalPosition,
          verseChange: false,
        });
      } else if (isCeremonyBani) {
        window.socket.emit('data', {
          host: 'sttm-desktop',
          type: 'ceremony',
          id: ceremonyId,
          shabadid: ceremonyId, // @deprecated
          highlight: crossPlatformId || baniVerse.crossPlatformID,
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
      Object.keys(activeVerse).forEach((activeVerseIndex) => {
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
      Object.keys(activeVerse).forEach((activeVerseIndex) => {
        if (parseInt(activeVerseIndex, 10) > 0) {
          const newVerseIndex = parseInt(activeVerseIndex, 10) - 1;
          const newVerseId = mappedShabadArray[newVerseIndex].verseId;
          updateTraversedVerse(newVerseId, newVerseIndex);
        }
      });
    }
  };

  const skipMangla = (shabadVerses, index) => {
    const gurmukhi = shabadVerses[index]?.verse;
    if (/(mhlw [\w])|(mÚ [\w])/.test(gurmukhi) || (index === 0 && /sloku/.test(gurmukhi))) {
      return skipIkOnkar(shabadVerses, index + 1);
    }
    return skipIkOnkar(shabadVerses, index);
  };

  const toggleHomeVerse = () => {
    if (isSundarGutkaBani || isCeremonyBani) {
      openNextVerse();
    } else if (homeVerse) {
      const mappedShabadArray = filterRequiredVerseItems(activeShabad);
      const currentVerseIndex = mappedShabadArray.findIndex(
        ({ verseId }) => verseId === activeVerseId,
      );
      let nextVerseIndex;

      if (atHome) {
        if (previousVerseIndex !== null) {
          nextVerseIndex = previousVerseIndex + 1;
          if (nextVerseIndex >= mappedShabadArray.length) {
            nextVerseIndex = 0;
          }
        } else {
          nextVerseIndex = 0;
        }
        nextVerseIndex = skipMangla(mappedShabadArray, nextVerseIndex);
        if (nextVerseIndex === homeVerse) {
          nextVerseIndex++;
        }
        setPreviousIndex(nextVerseIndex);
        setHome(false);
      } else {
        nextVerseIndex = skipMangla(mappedShabadArray, currentVerseIndex + 1);

        if (nextVerseIndex >= mappedShabadArray.length) {
          nextVerseIndex = 0;
        }
        const currentVerseObj = mappedShabadArray[currentVerseIndex];
        const nextVerseObj = mappedShabadArray[nextVerseIndex];

        if (currentVerseObj.lineNo !== nextVerseObj.lineNo) {
          nextVerseIndex = homeVerse;
          setHome(true);
        } else {
          setPreviousIndex(nextVerseIndex);
        }
      }
      const nextVerseId = mappedShabadArray[nextVerseIndex].verseId;
      scrollToVerse(nextVerseId);
      updateTraversedVerse(nextVerseId, nextVerseIndex);
    }
  };

  const changeHomeVerse = (verseIndex) => {
    if (homeVerse !== verseIndex) {
      const currentIndex = verseHistory.findIndex(
        (historyObj) => historyObj.shabadId === activeShabadId,
      );
      if (verseHistory[currentIndex]) {
        verseHistory[currentIndex].homeVerse = verseIndex;
      }
      setHomeVerse(verseIndex);
    }
  };

  const openFirstVerse = (firstVerse, crossPlatformID = null) => {
    updateTraversedVerse(firstVerse, 0, crossPlatformID);
    changeHomeVerse(0);
    virtuosoRef.current.scrollToIndex({
      index: 0,
      behavior: 'smooth',
      align: 'center',
    });
  };

  const saveToHistory = (verses, verseType, initialVerse = null) => {
    const firstVerse = verses[0];
    let shabadId = firstVerse.Shabads ? firstVerse.Shabads[0].ShabadID : firstVerse.shabadId;
    const verseId = initialVerse || firstVerse.ID;
    const firstVerseIndex = verses.findIndex((v) => v.ID === verseId);
    let verse;
    if (verseType === 'shabad') {
      if (initialVerse) {
        const clickedVerse = verses.filter((verseObj) => verseObj.ID === initialVerse);
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
    const check = verseHistory.filter((historyObj) => historyObj.shabadId === shabadId);
    if (check.length === 0) {
      const updatedHistory = [
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
          homeVerse: firstVerseIndex,
        },
        ...verseHistory,
      ];
      setVerseHistory(updatedHistory);
      return true;
    }
    return false;
  };

  const scrollToView = () => {
    setTimeout(() => {
      const currentIndex = activeShabad.findIndex((obj) => obj.ID === activeVerseId);
      // Ignoring flower verse to avoid unwanted scroll during asa di vaar
      if (activeVerseId !== 61 && activeShabad[currentIndex].Gurmukhi !== ',') {
        virtuosoRef.current.scrollToIndex({
          index: currentIndex,
          behavior: 'smooth',
          align: 'center',
        });
      }
    }, 100);
  };

  const copyToClipboard = () => {
    if (activeVerseRef && activeVerseRef.current) {
      const nonUniCodePanktee = activeVerseRef.current.childNodes[1].innerText;
      const uniCodePanktee = anvaad.unicode(nonUniCodePanktee);
      copy(uniCodePanktee);
      new Noty({
        type: 'info',
        text: `${i18n.t('SHORTCUT.COPY_TO_CLIPBOARD')}`,
        timeout: 2000,
      }).show();
    }
  };

  useEffect(() => {
    const baniVerseIndex = activeShabad.findIndex(
      (obj) => obj.crossPlatformID === savedCrossPlatformId,
    );
    if (baniVerseIndex >= 0) {
      updateTraversedVerse(activeShabad[baniVerseIndex].ID, baniVerseIndex);
    }
  }, [savedCrossPlatformId]);

  useEffect(() => {
    setPreviousIndex(null);
    setHome(true);
    if (isSundarGutkaBani && sundarGutkaBaniId) {
      // mangalPosition was removed from loadBani 3rd argument
      loadBani(sundarGutkaBaniId, baniLengthCols[baniLength]).then((sundarGutkaVerses) => {
        setActiveShabad(sundarGutkaVerses);
        saveToHistory(sundarGutkaVerses, 'bani');
        const check = sundarGutkaVerses.findIndex((verse) => verse.ID === activeVerseId);
        if (check < 0) {
          openFirstVerse(sundarGutkaVerses[0].ID, sundarGutkaVerses[0].crossPlatformID);
        }
      });
    } else if (isCeremonyBani && ceremonyId) {
      loadCeremony(ceremonyId).then((ceremonyVerses) => {
        if (ceremonyVerses) {
          setActiveShabad(ceremonyVerses);
          const newEntry = saveToHistory(ceremonyVerses, 'ceremony');
          if (newEntry) {
            openFirstVerse(ceremonyVerses[0].ID, ceremonyVerses[0].crossPlatformID);
          }
        }
      });
    } else {
      loadShabad(activeShabadId).then((verses) => {
        if (verses) {
          setActiveShabad(verses);
          if (initialVerseId) {
            if (!isDontSaveHistory) {
              saveToHistory(verses, 'shabad', initialVerseId);
            }
            if (isDontSaveHistory) {
              setIsDontSaveHistory(false);
            }
          } else {
            setInitialVerseId(verses[0].ID);
          }
          if (isRandomShabad) {
            openFirstVerse(verses[0].ID);
            setIsRandomShabad(false);
            saveToHistory(verses, 'shabad');
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
    // mangalPosition,
    isCeremonyBani,
    isSundarGutkaBani,
  ]);

  useEffect(() => {
    scrollToView();
  }, [minimizedBySingleDisplay]);

  useEffect(() => {
    filterRequiredVerseItems(activeShabad).forEach((verses, index) => {
      if (initialVerseId === verses.verseId) {
        if (homeVerse !== index) {
          changeHomeVerse(index);
        }
      }
      if (activeVerseId === verses.verseId) {
        setActiveVerse({ [verses.ID]: verses.verseId });
      }
    });

    if (!minimizedBySingleDisplay) {
      setTimeout(() => {
        if (activeVerseRef && activeVerseRef.current) {
          activeVerseRef.current.parentNode.scrollTop =
            activeVerseRef.current.offsetTop - activeVerseRef.current.parentNode.offsetTop;
        }
      }, 100);
    }
    setFilteredItems(filterRequiredVerseItems(activeShabad));
  }, [activeShabad]);

  useEffect(() => {
    scrollToView();
    const overlayVerse = filterOverlayVerseItems(activeShabad, activeVerseId);
    ipcRenderer.send(
      'show-line',
      JSON.stringify({
        Line: overlayVerse,
        live: liveFeed,
      }),
    );
  }, [activeShabad, activeVerseId]);

  // checks if keyboard shortcut is fired then it invokes the function
  useEffect(() => {
    if (shortcuts.nextVerse) {
      openNextVerse();
      scrollToView();
      setShortcuts({
        ...shortcuts,
        nextVerse: false,
      });
    }
    if (shortcuts.prevVerse) {
      openPrevVerse();
      scrollToView();
      setShortcuts({
        ...shortcuts,
        prevVerse: false,
      });
    }
    if (shortcuts.homeVerse) {
      toggleHomeVerse();
      setShortcuts({
        ...shortcuts,
        homeVerse: false,
      });
    }
    if (shortcuts.copyToClipboard) {
      copyToClipboard();
      setShortcuts({
        ...shortcuts,
        copyToClipboard: false,
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
        <Virtuoso
          data={filteredItems}
          ref={virtuosoRef}
          itemContent={(index, verses) => {
            const { verseId, verse, english } = verses;
            return (
              <ShabadVerse
                key={index}
                activeVerse={activeVerse}
                isHomeVerse={homeVerse}
                lineNumber={index}
                versesRead={versesRead}
                verse={verse}
                englishVerse={english}
                verseId={verseId}
                changeHomeVerse={changeHomeVerse}
                updateTraversedVerse={updateTraversedVerse}
              />
            );
          }}
        ></Virtuoso>
        <div className="controller-signal" title="Bani controller in use">
          <img alt="sync" src="assets/img/icons/sync.svg" />
        </div>
      </div>
    </div>
  );
};

export default ShabadContent;
