import { useStoreState } from 'easy-peasy';
import React from 'react';
import VersePanel from '../../../common/sttm-ui/versepanel/VersePanel';
import { useDataLayerValue } from '../state-manager/DataLayer';
import InsertPane from './InsertPane';
import OtherPane from './OtherPane';

function MiscContent() {
  const [{ misc_panel }, dispatch] = useDataLayerValue();
  const isHistory = misc_panel === 'History';
  const isInsert = misc_panel === 'Insert';
  const isOther = misc_panel === 'Others';
  const verse = useStoreState(state => state.navigator.verseSelected);
  return (
    <>
      {isHistory && <VersePanel verse={verse} HistoryPane />}
      {isInsert && <InsertPane />}
      {isOther && <OtherPane />}
    </>
  );
}

export default MiscContent;
