import React, { useState, useEffect } from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { loadShabad } from '../utils';
import { ShabadVerse } from '../../common/sttm-ui';

function ShabadContent() {
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
    activeVerseId,
  } = useStoreState(state => state.navigator);

  const {
    setVersesRead,
    setActiveVerseId,
    setIsEmptySlide,
    setIsWaheguruSlide,
    setHomeVerse,
    setIsAnnouncementSlide,
    setIsMoolMantraSlide,
  } = useStoreActions(state => state.navigator);
  const [activeShabad, setActiveShabad] = useState([]);
  const [activeVerse, setActiveVerse] = useState({});

  const filterRequiredVerseItems = verses => {
    return verses
      ? verses.map((verse, index) => {
          return {
            ID: index,
            verseId: verse.ID,
            verse: verse.Gurmukhi,
          };
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
    if (!versesRead.some(traversedVerse => traversedVerse === newTraversedVerse)) {
      const currentIndex = verseHistory.findIndex(
        historyObj => historyObj.shabadId === activeShabadId,
      );

      verseHistory[currentIndex].continueFrom = newTraversedVerse;
      verseHistory[currentIndex].versesRead = versesRead;
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
      verseHistory[currentIndex].homeVerse = verseIndex;
      setHomeVerse(verseIndex);
    }
  };

  useEffect(() => {
    if (activeShabadId && initialVerseId) {
      loadShabad(activeShabadId, initialVerseId).then(verses => setActiveShabad(verses));
    }
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
}

export default ShabadContent;
