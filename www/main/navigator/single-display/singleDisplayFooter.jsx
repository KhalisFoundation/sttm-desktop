import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

export const singleDisplayFooter = () => {
  const { singleDisplayActiveTab } = useStoreState(state => state.navigator);
  const { setSingleDisplayActiveTab } = useStoreActions(state => state.navigator);
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
  const openInsertPane = () => {
    if (singleDisplayActiveTab !== 'insert') {
      setSingleDisplayActiveTab('insert');
    }
  };
  const openOtherPane = () => {
    if (singleDisplayActiveTab !== 'other') {
      setSingleDisplayActiveTab('other');
    }
  };
  const openHistoryPane = () => {
    if (singleDisplayActiveTab !== 'history') {
      setSingleDisplayActiveTab('history');
    }
  };

  return (
    <div className="single-display-switches">
      <button
        className={`tab-switch ${singleDisplayActiveTab === 'search' ? 'active' : ''}`}
        onClick={openSearchPane}
      >
        <i className="fa fa-search" />
      </button>
      <button
        className={`tab-switch ${singleDisplayActiveTab === 'history' ? 'active' : ''}`}
        onClick={openHistoryPane}
      >
        <i className="fa fa-history" />
      </button>
      <button
        className={`tab-switch ${singleDisplayActiveTab === 'shabad' ? 'active' : ''}`}
        onClick={openShabadPane}
      >
        <i className="fa fa-dot-circle-o" />
      </button>
      <button
        className={`tab-switch ${singleDisplayActiveTab === 'insert' ? 'active' : ''}`}
        onClick={openInsertPane}
      >
        <i className="fa fa-desktop" />
      </button>
      <button
        className={`tab-switch ${singleDisplayActiveTab === 'other' ? 'active' : ''}`}
        onClick={openOtherPane}
      >
        <i className="fa fa-ellipsis-h" />
      </button>
    </div>
  );
};
