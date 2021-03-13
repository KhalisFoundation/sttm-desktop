import React from 'react';
import PaneContent from './PaneContent';
import PaneFooter from './PaneFooter';
import PaneHeader from './PaneHeader';

function Pane({ content, header, footer }) {
  return (
    <div className="pane">
      {header ? <PaneHeader Header={header} /> : ''}
      {content ? <PaneContent Content={content} /> : ''}
      {footer ? <PaneFooter Footer={footer} /> : ''}
    </div>
  );
}

export default Pane;
