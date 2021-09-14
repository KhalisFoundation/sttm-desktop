import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

export const singleDisplayHeader = () => {
  const { singleDisplayActiveTab, minimizedBySingleDisplay } = useStoreState(
    state => state.navigator,
  );
  const { setMinimizedBySingleDisplay } = useStoreActions(state => state.navigator);

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

  const toggleDisplayUI = () => {
    if (minimizedBySingleDisplay) {
      setMinimizedBySingleDisplay(false);
    } else {
      setMinimizedBySingleDisplay(true);
    }
  };

  return (
    <div className="header-controller">
      <span>{getActiveTab(singleDisplayActiveTab)}</span>
      <span onClick={toggleDisplayUI}>
        <i className={`fa fa-window-${minimizedBySingleDisplay ? 'maximize' : 'minimize'}`}></i>
      </span>
    </div>
  );
};
