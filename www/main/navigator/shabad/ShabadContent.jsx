import React, { useState, useEffect } from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { loadShabad } from '../utils';
import { ShabadVerse } from '../../common/sttm-ui';

function ShabadContent() {
  const { verseSelected, shabadSelected, versesHistory, traversedVerses } = useStoreState(
    state => state.navigator,
  );
  const { setTraversedVerses, setCurrentSelectedVerse } = useStoreActions(state => state.navigator);
  const [activeShabad, setActiveShabad] = useState([]);
  const [isHomeVerse, setIsHomeVerse] = useState();
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
    if (!traversedVerses.some(traversedVerse => traversedVerse === newTraversedVerse)) {
      const currentIndex = versesHistory.findIndex(
        historyObj => historyObj.shabadId === shabadSelected,
      );

      versesHistory[currentIndex].continueFrom = newTraversedVerse;
      versesHistory[currentIndex].versesRead = traversedVerses;
      setTraversedVerses([...traversedVerses, newTraversedVerse]);
    }
    setActiveVerse({ [verseIndex]: newTraversedVerse });
    setCurrentSelectedVerse(newTraversedVerse);
  };

  const changeHomeVerse = verseIndex => {
    setIsHomeVerse(verseIndex);
  };

  useEffect(() => {
    if (shabadSelected && verseSelected) {
      loadShabad(shabadSelected, verseSelected).then(verses => setActiveShabad(verses));
    }
    setIsHomeVerse(0);
  }, [verseSelected, shabadSelected]);

  useEffect(() => {
    filterRequiredVerseItems(activeShabad).forEach(verses => {
      if (verseSelected === verses.verseId) {
        // setTraversedVerses([verses.verseId]);
        setActiveVerse({ [verses.ID]: verses.verseId });
        setIsHomeVerse(verses.ID);
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
                isHomeVerse={isHomeVerse}
                lineNumber={index}
                traversedVerses={traversedVerses}
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
