import React, { useState, useEffect } from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { loadShabad } from '../utils';
import { ShabadVerse } from '../../common/sttm-ui';

function ShabadContent() {
  const { verseSelected, shabadSelected } = useStoreState(state => state.navigator);
  const { setCurrentSelectedVerse } = useStoreActions(state => state.navigator);
  const [activeShabad, setActiveShabad] = useState([]);

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

  useEffect(() => {
    if (shabadSelected && verseSelected) {
      loadShabad(shabadSelected, verseSelected).then(verses => setActiveShabad(verses));
    }
  }, [verseSelected, shabadSelected]);

  return (
    <div className="shabad-list">
      <ShabadVerse verses={filterRequiredVerseItems(activeShabad)} onClick={handleVerseClick} />
    </div>
  );
}

export default ShabadContent;
