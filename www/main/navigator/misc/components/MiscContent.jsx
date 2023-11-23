import React from 'react';
import { useStoreState } from 'easy-peasy';
import { FavoritePane } from './favoritePane';
import { HistoryPane } from './HistoryPane';
import { OtherPane } from './OtherPane';
import { classNames } from '../../../common/utils';

export const MiscContent = () => {
  const { currentMiscPanel } = useStoreState((state) => state.navigator);

  return (
    <>
      <HistoryPane className={classNames(currentMiscPanel !== 'History' && 'd-none')} />
      <OtherPane className={classNames(currentMiscPanel !== 'Others' && 'd-none')} />
      <FavoritePane className={currentMiscPanel === 'Favorite' ? '' : 'd-none'} />
    </>
  );
};
