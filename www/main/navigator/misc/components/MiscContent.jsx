import React from 'react';
import { useStoreState } from 'easy-peasy';
import { FavoritePane } from './favoritePane';
import { HistoryPane } from './HistoryPane';
import { OtherPane } from './OtherPane';
import { classNames } from '../../../common/utils';
import { TAB_NAMES } from '../../../common/constants/misc-tabs';

export const MiscContent = () => {
  const { currentMiscPanel } = useStoreState((state) => state.navigator);

  return (
    <>
      <HistoryPane className={classNames(currentMiscPanel !== TAB_NAMES.HISTORY && 'd-none')} />
      <OtherPane className={classNames(currentMiscPanel !== TAB_NAMES.OTHERS && 'd-none')} />
      <FavoritePane className={currentMiscPanel === TAB_NAMES.FAVORITES ? '' : 'd-none'} />
    </>
  );
};
