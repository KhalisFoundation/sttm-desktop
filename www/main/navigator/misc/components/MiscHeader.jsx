import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

import { classNames } from '../../../common/utils';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const analytics = remote.getGlobal('analytics');

export const MiscHeader = () => {
  const { currentMiscPanel, historyOrder, verseHistory } = useStoreState(
    (state) => state.navigator,
  );
  const { setCurrentMiscPanel, setHistoryOrder } = useStoreActions((state) => state.navigator);

  const isHistory = currentMiscPanel === 'History';
  const isOther = currentMiscPanel === 'Others';
  const isFav = currentMiscPanel === 'Favorite';

  const setTab = (tabName) => {
    if (tabName !== currentMiscPanel) {
      setCurrentMiscPanel(tabName);
    }
    analytics.trackEvent({
      category: 'Misc',
      action: 'set-tab',
      label: tabName,
    });
  };

  return (
    <div className="misc-header">
      <div className="misc-header-nav">
        <a
          className={classNames('misc-button', isHistory && 'misc-active')}
          onClick={() => setTab('History')}
        >
          <i className="fa fa-clock-o">
            <span className="Icon-label" key="History">
              {i18n.t('TOOLBAR.HISTORY')}
            </span>
          </i>
        </a>
        <a
          className={classNames('misc-button', isFav && 'misc-active')}
          onClick={() => setTab('Favorite')}
        >
          <i className="fa fa-heart">
            <span className="Icon-label" key="Favorite">
              {i18n.t('TOOLBAR.FAVORITE')}
            </span>
          </i>
        </a>
        <a
          className={classNames('misc-button', isOther && 'misc-active')}
          onClick={() => setTab('Others')}
        >
          <i className="fa fa-ellipsis-h">
            <span className="Icon-label" key="Others">
              {i18n.t('TOOLBAR.OTHERS')}
            </span>
          </i>
        </a>
      </div>
      <div className="misc-header-sort">
        {isHistory && verseHistory.length > 1 && (
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
      </div>
    </div>
  );
};
