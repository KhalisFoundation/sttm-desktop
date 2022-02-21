import React from 'react';
import { useStoreState } from 'easy-peasy';

import ToolbarItem from './ToolbarItem';

const Toolbar = () => {
  const { minimizedBySingleDisplay } = useStoreState(state => state.navigator);
  const toolbarItems = ['sunder-gutka', 'ceremonies', 'sync-button', 'lock-screen', 'settings'];

  return (
    <div
      id="toolbar-nav"
      className={`${
        minimizedBySingleDisplay ? 'single-display-hide-left' : 'single-display-show-left'
      }`}
    >
      {toolbarItems.map((itemName, index) => {
        return <ToolbarItem key={index} itemName={itemName} />;
      })}
    </div>
  );
};

export default Toolbar;
