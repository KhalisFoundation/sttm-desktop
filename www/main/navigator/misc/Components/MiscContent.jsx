import React from 'react';
import { useDataLayerValue } from '../state-manager/DataLayer';
import Historypane from './Historypane';
import InsertPane from './InsertPane';
import OtherPane from './OtherPane';

function MiscContent() {
  const [{ misc_panel }, dispatch] = useDataLayerValue();
  const isHistory = misc_panel === 'History';
  const isInsert = misc_panel === 'Insert';
  const isOther = misc_panel === 'Others';
  return (
    <>
      {isHistory && <Historypane />}
      {isInsert && <InsertPane />}
      {isOther && <OtherPane />}
    </>
  );
}

export default MiscContent;
