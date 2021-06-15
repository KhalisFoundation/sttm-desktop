import React from 'react';
import { useStoreState } from 'easy-peasy';
import { HistoryPane, OtherPane, InsertPane } from '../misc/components';
import SearchPane from '../search/components/SearchPane';
import ShabadPane from '../shabad/ShabadPane';

export const singleDisplayContent = () => {
  const { singleDisplayActiveTab } = useStoreState(state => state.navigator);
  const renderSingleTab = tabName => {
    let component;
    switch (tabName) {
      case 'search':
        component = <SearchPane />;
        break;

      case 'shabad':
        component = <ShabadPane />;

        break;

      case 'history':
        component = <HistoryPane />;
        break;

      case 'other':
        component = <OtherPane />;

        break;

      case 'insert':
        component = <InsertPane />;
        break;

      default:
        break;
    }
    return component;
  };

  return renderSingleTab(singleDisplayActiveTab);
};
