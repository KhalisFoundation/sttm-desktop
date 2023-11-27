import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

export const singleDisplayHeader = () => {
  const { singleDisplayActiveTab, minimizedBySingleDisplay, historyOrder } = useStoreState(
    (state) => state.navigator,
  );
  const { setMinimizedBySingleDisplay, setHistoryOrder } = useStoreActions(
    (state) => state.navigator,
  );

  const getActiveTab = (tabName) => {
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

      case 'announcement':
        component = 'Announcement';
        break;

      case 'dhan-guru':
        component = 'Dhan Guru';
        break;

      case 'favorite':
        component = 'Favorites';
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
      {singleDisplayActiveTab === 'history' && (
        <div className="history-order">
          <div className="history-order-select">
            <label>Sort by: </label>
            <select
              value={historyOrder}
              onChange={(e) => {
                setHistoryOrder(e.target.value);
              }}
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
          </div>
        </div>
      )}
      <span onClick={toggleDisplayUI}>
        <i className={`fa fa-window-${minimizedBySingleDisplay ? 'maximize' : 'minimize'}`}></i>
      </span>
    </div>
  );
};
