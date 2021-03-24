import React from 'react';
import { useStoreState } from 'easy-peasy';
import VersePanel from '../../common/sttm-ui/versepanel/VersePanel';
function ShabadContent() {
  const verse = useStoreState(state => state.navigator.verseSelected);
  const shabad = useStoreState(state => state.navigator.shabadSelected);

  return (
    <div className="shabad-list">
      <VersePanel ShabadPane verses={shabad} activeVerse={verse} />
    </div>
  );
}

export default ShabadContent;
