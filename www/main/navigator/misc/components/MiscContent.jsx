import React from 'react';
import { useDataLayerValue } from '../state-manager/DataLayer';
import { HistoryPane } from './HistoryPane';
import { InsertPane } from './InsertPane';
import { OtherPane } from './OtherPane';

export const MiscContent = () => {
  const [{ miscPanel }] = useDataLayerValue();
  const isHistory = miscPanel === 'History';
  const isInsert = miscPanel === 'Insert';
  const isOther = miscPanel === 'Others';
  return (
    <>
      {isHistory && <HistoryPane />}
      {isInsert && <InsertPane />}
      {isOther && <OtherPane />}
    </>
  );
};
