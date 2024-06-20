import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { classNames } from '../../common/utils';
import { TAB_NAMES } from '../../common/constants/misc-tabs';

export const singleDisplayFooter = () => {
  const { singleDisplayActiveTab } = useStoreState((state) => state.navigator);
  const { setSingleDisplayActiveTab } = useStoreActions((state) => state.navigator);
  const openSearchPane = () => {
    if (singleDisplayActiveTab !== 'search') {
      setSingleDisplayActiveTab('search');
    }
  };

  const openShabadPane = () => {
    if (singleDisplayActiveTab !== 'shabad') {
      setSingleDisplayActiveTab('shabad');
    }
  };
  const openOtherPane = () => {
    if (singleDisplayActiveTab !== TAB_NAMES.OTHERS) {
      setSingleDisplayActiveTab(TAB_NAMES.OTHERS);
    }
  };
  const openHistoryPane = () => {
    if (singleDisplayActiveTab !== TAB_NAMES.HISTORY) {
      setSingleDisplayActiveTab(TAB_NAMES.HISTORY);
    }
  };
  const openFavoritePane = () => {
    if (singleDisplayActiveTab !== TAB_NAMES.FAVORITES) {
      setSingleDisplayActiveTab(TAB_NAMES.FAVORITES);
    }
  };

  return (
    <div className="single-display-switches">
      <button
        className={classNames('tab-switch', singleDisplayActiveTab === 'search' && 'active')}
        onClick={openSearchPane}
      >
        <i className="fa fa-search" />
      </button>
      <button
        className={classNames(
          'tab-switch',
          singleDisplayActiveTab === TAB_NAMES.HISTORY && 'active',
        )}
        onClick={openHistoryPane}
      >
        <i className="fa fa-history" />
      </button>
      <button
        className={classNames('tab-switch', singleDisplayActiveTab === 'shabad' && 'active')}
        onClick={openShabadPane}
      >
        <i className="fa fa-dot-circle-o" />
      </button>
      <button
        className={classNames(
          'tab-switch',
          singleDisplayActiveTab === TAB_NAMES.FAVORITES && 'active'
        )}
        onClick={openFavoritePane}
      >
        <i className="fa fa-heart" />
      </button>
      <button
        className={classNames(
          'tab-switch',
          singleDisplayActiveTab === TAB_NAMES.OTHERS && 'active'
        )}
        onClick={openOtherPane}
      >
        <i className="fa fa-ellipsis-h" />
      </button>
    </div>
  );
};
