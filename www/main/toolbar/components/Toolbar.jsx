import React from 'react';

import ToolbarItem from './ToolbarItem';

const Toolbar = () => {
  const toolbarItems = ['sunder-gutka', 'ceremonies', 'sync-button', 'lock-screen', 'settings'];

  return (
    <div id="toolbar-nav">
      {toolbarItems.map((itemName, index) => {
        return <ToolbarItem key={index} itemName={itemName} />;
      })}
    </div>
  );
};

export default Toolbar;
