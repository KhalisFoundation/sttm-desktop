import React from 'react';
import { useDataLayerValue } from '../state-manager/DataLayer';
import { FavoritePane } from './favoritePane';
import { HistoryPane } from './HistoryPane';
import { InsertPane } from './InsertPane';
import { OtherPane } from './OtherPane';

export const MiscContent = () => {
  const [{ miscPanel }] = useDataLayerValue();

  return (
    <>
      <HistoryPane className={miscPanel === 'History' ? '' : 'd-none'} />
      <InsertPane className={miscPanel === 'Insert' ? '' : 'd-none'} />
      <FavoritePane className={miscPanel === 'Favorite' ? '' : 'd-none'} />
      <OtherPane className={miscPanel === 'Others' ? '' : 'd-none'} />
    </>
  );
};
