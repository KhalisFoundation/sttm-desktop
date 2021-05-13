import React, { useState, useEffect } from 'react';
import { useStoreState } from 'easy-peasy';
import VersePanel from '../../common/sttm-ui/versepanel/VersePanel';
import { loadShabad } from '../utils';

function ShabadContent() {
  const { verseSelected, shabadSelected } = useStoreState(state => state.navigator);
  const [activeShabad, setActiveShabad] = useState();
  // console.log(verseSelected, shabadSelected);

  const filterRequiredVerseItems = verses => {
    return verses
      ? verses.map(verse => {
          return {
            verseId: verse.ID,
            shabadId: verse.Shabads[0].ShabadID,
            verse: verse.Gurmukhi,
            ang: verse.PageNo,
            writer: verse.Writer ? verse.Writer.WriterEnglish : '',
            raag: verse.Raag ? verse.Raag.RaagEnglish : '',
            source: verse.Source ? verse.Source.SourceEnglish : '',
          };
        })
      : [];
  };

  useEffect(() => {
    setActiveShabad(loadShabad(827, 11228, setActiveShabad));

    // uncomment the below line to get the results from state after resolving state updation issue in versepanel
    // setActiveShabad(loadShabad(shabadSelected, verseSelected, setActiveShabad));
  }, [shabadSelected, verseSelected]);

  return (
    <div className="shabad-list">
      <VersePanel
        ShabadPane
        verses={filterRequiredVerseItems(activeShabad)}
        activeVerse={verseSelected}
      />
    </div>
  );
}

export default ShabadContent;
