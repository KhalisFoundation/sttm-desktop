import React from 'react';
import { useStoreState } from 'easy-peasy';
import { HistoryPane } from './HistoryPane';
import { InsertPane } from './InsertPane';
import { OtherPane } from './OtherPane';

export const MiscContent = () => {
  const { currentMiscPanel } = useStoreState((state) => state.navigator);

  return (
    <>
      <HistoryPane className={currentMiscPanel === 'History' ? '' : 'd-none'} />
      <InsertPane className={currentMiscPanel === 'Insert' ? '' : 'd-none'} />
      <OtherPane className={currentMiscPanel === 'Others' ? '' : 'd-none'} />
    </>
  );
};
