import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';
import ShabadHeader from '../shabad/ShabadHeader';
import { TAB_NAMES } from '../../common/constants/misc-tabs';

export const singleDisplayHeader = () => {
  const { singleDisplayActiveTab, minimizedBySingleDisplay, historyOrder, verseHistory } =
    useStoreState((state) => state.navigator);
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
        component = '';

        break;

      case TAB_NAMES.HISTORY:
        component = TAB_NAMES.HISTORY;
        break;

      case TAB_NAMES.OTHERS:
        component = TAB_NAMES.OTHERS;

        break;

      case 'announcement':
        component = 'Announcement';
        break;

      case 'dhan-guru':
        component = 'Dhan Guru';
        break;

      case TAB_NAMES.FAVORITES:
        component = TAB_NAMES.FAVORITES;
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
      {singleDisplayActiveTab === TAB_NAMES.HISTORY && verseHistory.length > 1 && (
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
      {singleDisplayActiveTab === 'shabad' && <ShabadHeader />}
      <span onClick={toggleDisplayUI}>
        <i className={`fa fa-window-${minimizedBySingleDisplay ? 'maximize' : 'minimize'}`}></i>
      </span>
    </div>
  );
};
