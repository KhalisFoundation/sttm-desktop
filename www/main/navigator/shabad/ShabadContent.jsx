import React, { useState, useEffect } from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

import { loadShabad, loadBani } from '../utils';
import { ShabadVerse } from '../../common/sttm-ui';

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
  } = useStoreActions(state => state.navigator);
  const [activeShabad, setActiveShabad] = useState([]);
  const [activeVerse, setActiveVerse] = useState({});

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

  useEffect(() => {
    loadShabad(activeShabadId, initialVerseId).then(verses => {
      if (verses) {
        setActiveShabad(verses);
        if (noActiveVerse) {
          updateTraversedVerse(verses[0].ID, 0);
          changeHomeVerse(0);
        }
      }
    });
  }, [initialVerseId, activeShabadId]);

  useEffect(() => {
    filterRequiredVerseItems(activeShabad).forEach(verses => {
      if (initialVerseId === verses.verseId) {
        setVersesRead([...versesRead, verses.verseId]);
        setActiveVerse({ [verses.ID]: verses.verseId });
        if (homeVerse !== verses.ID) {
          setHomeVerse(verses.ID);
        }
      }
    });
  }, [activeShabad]);

  useEffect(() => {
    const activeBani = [];
    loadBani(sundarGutkaBaniId).then(singleVerse => {
      activeBani.push(singleVerse);
      setActiveShabad(...activeBani);
      if (noActiveVerse) {
        updateTraversedVerse(activeBani[0][0].ID, 0);
        changeHomeVerse(0);
      }
    });
  }, [sundarGutkaBaniId]);

  return (
    <div className="shabad-list">
      <div className="verse-block">
        <div className="result-list">
          <ul>
            {filterRequiredVerseItems(activeShabad).map(({ verseId, verse }, index) => (
              <ShabadVerse
                key={verseId}
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
