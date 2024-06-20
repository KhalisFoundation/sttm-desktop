import React from 'react';
import { useStoreState } from 'easy-peasy';
import { HistoryPane, OtherPane, FavoritePane } from '../misc/components';
import SearchPane from '../search/components/SearchPane';
import ShabadContent from '../shabad/ShabadContent';
import { TAB_NAMES } from '../../common/constants/misc-tabs';

export const singleDisplayContent = () => {
  const { singleDisplayActiveTab } = useStoreState((state) => state.navigator);
  const renderSingleTab = (tabName) => {
    const components = (
      <>
        <SearchPane className={tabName === 'search' ? '' : 'd-none'} />
        <div className={tabName === 'shabad' ? 'pane-container shabad-pane' : 'd-none'}>
          <div className="pane">
            <div className="pane-content">
              <ShabadContent />
            </div>
          </div>
        </div>
        <HistoryPane className={tabName === TAB_NAMES.HISTORY ? '' : 'd-none'} />
        <OtherPane className={tabName === TAB_NAMES.OTHERS ? '' : 'd-none'} />
        <FavoritePane className={tabName === TAB_NAMES.FAVORITES ? '' : 'd-none'} />
      </>
    );

    return components;
  };

  return renderSingleTab(singleDisplayActiveTab);
};
