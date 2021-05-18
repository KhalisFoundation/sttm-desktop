import React, { useState, useEffect } from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { loadShabad } from '../utils';
import { ShabadVerse } from '../../common/sttm-ui';

function ShabadContent() {
  const { verseSelected, shabadSelected } = useStoreState(state => state.navigator);
  const { setCurrentSelectedVerse } = useStoreActions(state => state.navigator);
  const [activeShabad, setActiveShabad] = useState([]);
  const [isHomeVerse, setIsHomeVerse] = useState();
  const [activeVerse, setActiveVerse] = useState({});
  const [traversedVerses, setTraversedVerses] = useState([]);

  const filterRequiredVerseItems = verses => {
    return verses
      ? verses.map(verse => {
          return {
            verseId: verse.ID,
            verse: verse.Gurmukhi,
          };
        })
      : [];
  };

  const handleVerseClick = currentVerse => {
    setCurrentSelectedVerse(currentVerse);
  };

  const updateTraversedVerse = (newTraversedVerse, verseIndex) => {
    if (!traversedVerses.some(traversedVerse => traversedVerse === newTraversedVerse)) {
      setTraversedVerses([...traversedVerses, newTraversedVerse]);
    }
    setActiveVerse({ [verseIndex]: newTraversedVerse });
  };

  const changeHomeVerse = verseIndex => {
    setIsHomeVerse(verseIndex);
  };

  useEffect(() => {
    if (shabadSelected && verseSelected) {
      loadShabad(shabadSelected, verseSelected).then(verses => setActiveShabad(verses));
    }
  }, [verseSelected, shabadSelected]);

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
                onClick={handleVerseClick}
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
