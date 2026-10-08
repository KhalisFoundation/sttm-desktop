import React from 'react';
import { useStoreState } from 'easy-peasy';

import ToolbarItem from './ToolbarItem';

const { SHADOW_BUILD } = require('../../addons/voice-follow/shadow/config');

const Toolbar = () => {
  const { minimizedBySingleDisplay } = useStoreState((state) => state.navigator);
  // Tester builds hide Voice-Follow: it runs silently in the shadow (addons/voice-follow/shadow).
  const toolbarTop = [
    'sunder-gutka',
    'ceremonies',
    ...(SHADOW_BUILD ? [] : ['voice-follow']),
    'announcement',
  ];
  const toolbarBottom = ['sync-button', 'lock-screen', 'auth-dialog', 'settings'];

  return (
    <div
      id="toolbar-nav"
      className={`${
        minimizedBySingleDisplay ? 'single-display-hide-left' : 'single-display-show-left'
      }`}
    >
      <div className="toolbar-top">
        {toolbarTop.map((itemName, index) => (
          <ToolbarItem key={index} itemName={itemName} />
        ))}
      </div>

      <div className="toolbar-bottom">
        {toolbarBottom.map((itemName, index) => (
          <ToolbarItem key={index} itemName={itemName} />
        ))}
      </div>
    </div>
  );
};

export default Toolbar;
