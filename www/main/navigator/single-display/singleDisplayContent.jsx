import React from 'react';
import { useStoreState } from 'easy-peasy';
import {
  HistoryPane,
  OtherPane,
  AnnouncementPane,
  DhanGuruPane,
  FavoritePane,
} from '../misc/components';
import SearchPane from '../search/components/SearchPane';
import ShabadPane from '../shabad/ShabadPane';

export const singleDisplayContent = () => {
  const { singleDisplayActiveTab } = useStoreState((state) => state.navigator);
  const renderSingleTab = (tabName) => {
    const components = (
      <>
        <SearchPane className={tabName === 'search' ? '' : 'd-none'} />
        <ShabadPane className={tabName === 'shabad' ? '' : 'd-none'} />
        <HistoryPane className={tabName === 'history' ? '' : 'd-none'} />
        <OtherPane className={tabName === 'other' ? '' : 'd-none'} />
        <AnnouncementPane className={tabName === 'announcement' ? '' : 'd-none'} />
        <DhanGuruPane className={tabName === 'dhan-guru' ? '' : 'd-none'} />
        <FavoritePane className={tabName === 'favorite' ? '' : 'd-none'} />
      </>
    );

    return components;
  };

  return renderSingleTab(singleDisplayActiveTab);
};
