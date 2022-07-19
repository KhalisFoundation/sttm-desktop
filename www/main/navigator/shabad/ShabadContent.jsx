import Noty from 'noty';
import React, { useState, useEffect, useRef } from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { ipcRenderer } from 'electron';

const remote = require('@electron/remote');

import copy from 'copy-to-clipboard';
import { Virtuoso } from 'react-virtuoso';
import { loadShabad, loadBani, loadCeremony } from '../utils';
import { ShabadVerse } from '../../common/sttm-ui';

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
  } = useStoreState(state => state.navigator);

  const {
    setVersesRead,
    setActiveVerseId,
    setHomeVerse,
    setShortcuts,
    setIsRandomShabad,
    setVerseHistory,
    setIsMiscSlide,
    setIsDontSaveHistory,
  } = useStoreActions(state => state.navigator);

  // mangalPosition was removed from below settings
  const { autoplayToggle, autoplayDelay, baniLength, liveFeed } = useStoreState(
    state => state.userSettings,
  );
  const [previousActiveVerse, setPreviousActiveVerse] = useState(activeVerseId);
  const [activeShabad, setActiveShabad] = useState([]);
  const [activeVerse, setActiveVerse] = useState({});
  const activeVerseRef = useRef(null);
  const virtuosoRef = useRef(null);
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

  const [filteredItems, setFilteredItems] = useState(filterRequiredVerseItems(activeShabad));

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

  const updateTraversedVerse = (newTraversedVerse, verseIndex, crossPlatformId = null) => {
    if (isMiscSlide) {
      setIsMiscSlide(false);
    }
    if (!versesRead.some(traversedVerse => traversedVerse === newTraversedVerse)) {
      const currentIndex = verseHistory.findIndex(
        historyObj => historyObj.shabadId === activeShabadId,
      );
      setVersesRead([...versesRead, newTraversedVerse]);

      if (verseHistory[currentIndex]) {
        verseHistory[currentIndex].continueFrom = newTraversedVerse;
        verseHistory[currentIndex].versesRead = [...versesRead, newTraversedVerse];
      }
    }
    setActiveVerse({ [verseIndex]: newTraversedVerse });
    if (activeVerseId !== newTraversedVerse) {
      setActiveVerseId(newTraversedVerse);
    }

    if (window.socket !== undefined && window.socket !== null) {
      let baniVerse;
      if (!crossPlatformId) {
        baniVerse = activeShabad.find(obj => obj.ID === newTraversedVerse);
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
      const homeVerseIndex = homeVerse;
      if (mappedShabadArray[homeVerseIndex]) {
        const homeVerseId = mappedShabadArray[homeVerseIndex].verseId;
        setPreviousActiveVerse(activeVerseId);

        if (homeVerseId === activeVerseId) {
          const previousVerseIndex = activeShabad.findIndex(
            verseObj => verseObj.ID === previousActiveVerse,
          );
          updateTraversedVerse(previousActiveVerse, previousVerseIndex);
        } else {
          updateTraversedVerse(homeVerseId, homeVerseIndex);
        }
      }
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

  const openFirstVerse = (firstVerse, crossPlatformID = null) => {
    updateTraversedVerse(firstVerse, 0, crossPlatformID);
    changeHomeVerse(0);
  };

  const saveToHistory = (verses, verseType, initialVerse = null) => {
    const firstVerse = verses[0];
    let shabadId = firstVerse.Shabads ? firstVerse.Shabads[0].ShabadID : firstVerse.shabadId;
    const verseId = initialVerse || firstVerse.ID;
    const firstVerseIndex = verses.findIndex(v => v.ID === verseId);
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
    }
  };

  const scrollToView = () => {
    setTimeout(() => {
      const currentIndex = activeShabad.findIndex(obj => obj.ID === activeVerseId);
      virtuosoRef.current.scrollToIndex({
        index: currentIndex,
        behavior: 'smooth',
        align: 'center',
      });
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
    if (isSundarGutkaBani && sundarGutkaBaniId) {
      // mangalPosition was removed from loadBani 3rd argument
      loadBani(sundarGutkaBaniId, baniLengthCols[baniLength]).then(sundarGutkaVerses => {
        setActiveShabad(sundarGutkaVerses);
        saveToHistory(sundarGutkaVerses, 'bani');
        openFirstVerse(sundarGutkaVerses[0].ID, sundarGutkaVerses[0].crossPlatformID);
      });
    } else if (isCeremonyBani && ceremonyId) {
      loadCeremony(ceremonyId).then(ceremonyVerses => {
        if (ceremonyVerses) {
          setActiveShabad(ceremonyVerses);
          saveToHistory(ceremonyVerses, 'ceremony');
          openFirstVerse(ceremonyVerses[0].ID, ceremonyVerses[0].crossPlatformID);
        }
      });
    } else {
      loadShabad(activeShabadId, initialVerseId).then(verses => {
        if (verses) {
          setActiveShabad(verses);
          if (initialVerseId) {
            if (!isDontSaveHistory) {
              saveToHistory(verses, 'shabad', initialVerseId);
            }
            if (isDontSaveHistory) {
              setIsDontSaveHistory(false);
            }
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
    scrollToView();
  }, [activeShabad]);

  useEffect(() => {
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
      openHomeVerse();
      scrollToView();
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
