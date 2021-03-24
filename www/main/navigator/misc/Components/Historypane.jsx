import React from 'react';
import VersePanel from '../../../common/sttm-ui/versepanel/VersePanel';
import { useStoreState } from 'easy-peasy';

function Historypane() {
  const versesHistory = useStoreState(state => state.navigator.versesHistory);
  const activeVerse = useStoreState(state => state.navigator.selectedVerse);

  return (
    <div className="history-results">
      <VersePanel verses={versesHistory} HistoryPane activeVerse={activeVerse} />
    </div>
  );
}

export default Historypane;
