import React from 'react';
import { useDataLayerValue } from '../state-manager/DataLayer';
import Historypane from './Historypane';
import InsertPane from './InsertPane';
import OtherPane from './OtherPane';

function MiscContent() {
  const [{ miscPanel }] = useDataLayerValue();
  const isHistory = miscPanel === 'History';
  const isInsert = miscPanel === 'Insert';
  const isOther = miscPanel === 'Others';
  return (
    <>
      {isHistory && <Historypane />}
      {isInsert && <InsertPane />}
      {isOther && <OtherPane />}
    </>
  );
}

export default MiscContent;
