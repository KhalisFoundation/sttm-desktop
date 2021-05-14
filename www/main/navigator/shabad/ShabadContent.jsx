import React, { useState, useEffect } from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { loadShabad } from '../utils';
import { ShabadVerse } from '../../common/sttm-ui';

function ShabadContent() {
  const { verseSelected, shabadSelected, testingState } = useStoreState(state => state.navigator);
  const { setTestingState } = useStoreActions(state => state.navigator);
  const [activeShabad, setActiveShabad] = useState([]);

  const filterRequiredVerseItems = verses => {
    return verses
      ? verses.map(verse => {
          return {
            verseId: verse.ID,
            shabadId: verse.Shabads[0].ShabadID,
            verse: verse.Gurmukhi,
          };
        })
      : [];
  };

  const handleVerseClick = async (selectedVerseId, selectedShabadId) => {
    await setTestingState(selectedVerseId.toString());
    console.log(testingState);
    await setTestingState(selectedShabadId.toString());
    console.log(testingState);
    console.log(selectedVerseId, selectedShabadId, testingState);
  };

  useEffect(() => {
    loadShabad(827, 11228).then(verses => setActiveShabad(verses));
  }, [testingState]);

  return (
    <div className="shabad-list">
      <ShabadVerse verses={filterRequiredVerseItems(activeShabad)} onClick={handleVerseClick} />
    </div>
  );
}

export default ShabadContent;
