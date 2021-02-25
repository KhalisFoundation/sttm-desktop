import React from 'react';
import PaneContent from './PaneContent';
import PaneFooter from './PaneFooter';
import PaneHeader from './PaneHeader';

function Pane({ Content, Header, Footer }) {
  return (
    <div className="pane">
      {Header ? <PaneHeader Header={Header} /> : ''}
      {Content ? <PaneContent Content={Content} /> : ''}
      {Footer ? <PaneFooter Footer={Footer} /> : ''}
    </div>
  );
}

export default Pane;
