import React from 'react';

function PaneFooter({ Footer }) {
  return <div className="pane-footer">{Footer ? <Footer /> : ''}</div>;
}

export default PaneFooter;
