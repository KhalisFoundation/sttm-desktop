import React from 'react';
import ToolbarItem from './toolbar-item';

function Toolbar() {
  const toolbarItems = ['sunder-gutka', 'ceremonies', 'sync-button', 'lock-screen'];

  return (
    <div id="toolbar-nav">
      {toolbarItems.map((itemName, index) => {
        return <ToolbarItem key={index} itemName={itemName} />;
      })}
    </div>
  );
}

export default Toolbar;
