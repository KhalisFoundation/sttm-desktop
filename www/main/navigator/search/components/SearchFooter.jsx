import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const SearchFooter = () => {
  const { searchShabadsCount, pane1, pane2, pane3 } = useStoreState((state) => state.navigator);
  const { currentWorkspace, defaultPaneId } = useStoreState((state) => state.userSettings);
  const { setDefaultPaneId } = useStoreActions((actions) => actions.userSettings);

  const addActiveClass = (id) => (id === defaultPaneId ? 'active' : '');

  return (
    <div className="search-footer">
      <span className="search-footer-span1">Sri Guru Granth Sahib</span>
      <span className="search-footer-span2">Sri Dasam Granth</span>
      <span className="search-footer-span3">Amrit Keertan</span>
      <span className="search-footer-span4">Other</span>
      <span>{searchShabadsCount ? `${searchShabadsCount} Results` : ''}</span>
      {currentWorkspace === i18n.t('WORKSPACES.MULTI_PANE') && (
        <div className="default-pane-switcher">
          <button
            className={`pane-1-btn ${addActiveClass(1)}`}
            onClick={() => {
              if (defaultPaneId !== 1) {
                setDefaultPaneId(1);
              }
            }}
            disabled={pane1.locked}
          >
            1
          </button>
          <button
            className={`pane-2-btn ${addActiveClass(2)}`}
            onClick={() => {
              if (defaultPaneId !== 2) {
                setDefaultPaneId(2);
              }
            }}
            disabled={pane2.locked}
          >
            2
          </button>
          <button
            className={`pane-3-btn ${addActiveClass(3)}`}
            onClick={() => {
              if (defaultPaneId !== 3) {
                setDefaultPaneId(3);
              }
            }}
            disabled={pane3.locked}
          >
            3
          </button>
        </div>
      )}
    </div>
  );
};

export default SearchFooter;
