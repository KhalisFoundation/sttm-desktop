import React from 'react';

import { ToolbarItem } from './ToolbarItem';

export const Toolbar = () => {
  const toolbarItems = ['sunder-gutka', 'ceremonies', 'sync-button', 'lock-screen'];
  console.log('WHY NOT TOOLBAR..');
  return (
    <div id="toolbar-nav">
      {toolbarItems.map((itemName, index) => {
        return <ToolbarItem key={index} itemName={itemName} />;
      })}
    </div>
  );
};
