import React from 'react';
import { useStoreState } from 'easy-peasy';

import ToolbarItem from './ToolbarItem';

const Toolbar = () => {
  const { minimizedBySingleDisplay } = useStoreState(state => state.navigator);
  const toolbarItems = ['sunder-gutka', 'ceremonies', 'sync-button', 'lock-screen', 'settings'];

  return (
    !minimizedBySingleDisplay && (
      <div id="toolbar-nav">
        {toolbarItems.map((itemName, index) => {
          return <ToolbarItem key={index} itemName={itemName} />;
        })}
      </div>
    )
  );
};

export default Toolbar;
