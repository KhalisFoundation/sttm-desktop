import React from 'react';

function PaneContent({ Content }) {
  return <div className="pane-content">{Content ? <Content /> : ''}</div>;
}

export default PaneContent;
