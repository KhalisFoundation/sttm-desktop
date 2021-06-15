import React from 'react';
import { useStoreState } from 'easy-peasy';

export const singleDisplayHeader = () => {
  const { singleDisplayActiveTab } = useStoreState(state => state.navigator);
  const getActiveTab = tabName => {
    let component;
    switch (tabName) {
      case 'search':
        component = 'Search';
        break;

      case 'shabad':
        component = 'Shabad';

        break;

      case 'history':
        component = 'History';
        break;

      case 'other':
        component = 'Other';

        break;

      case 'insert':
        component = 'Insert';
        break;

      default:
        break;
    }
    return component;
  };

  return <div>{getActiveTab(singleDisplayActiveTab)}</div>;
};
