import React from 'react';

function PaneHeader({ Header }) {
  return <div className="pane-header">{Header ? <Header /> : ''}</div>;
}

export default PaneHeader;
