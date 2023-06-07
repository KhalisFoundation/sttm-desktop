import React from 'react';
import { useStoreState } from 'easy-peasy';
import { HistoryPane } from './HistoryPane';
import { AnnouncementPane } from './AnnouncementPane';
import { OtherPane } from './OtherPane';
import { DhanGuruPane } from './DhanGuruPane';
import { classNames } from '../../../common/utils';

export const MiscContent = () => {
  const { currentMiscPanel } = useStoreState((state) => state.navigator);

  return (
    <>
      <HistoryPane className={classNames(currentMiscPanel !== 'History' && 'd-none')} />
      <AnnouncementPane className={classNames(currentMiscPanel !== 'Announcement' && 'd-none')} />
      <OtherPane className={classNames(currentMiscPanel !== 'Others' && 'd-none')} />
      <DhanGuruPane className={classNames(currentMiscPanel !== 'DhanGuru' && 'd-none')} />
    </>
  );
};
