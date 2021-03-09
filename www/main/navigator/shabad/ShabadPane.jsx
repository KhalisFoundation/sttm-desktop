import React from 'react';
import Pane from '../../common/sttm-ui/pane/Pane';
import ShabadContent from './ShabadContent';
import ShabadHeader from './ShabadHeader';

function ShabadPane() {
  return (
    <div className="shabad-pane">
      <Pane Header={ShabadHeader} Content={ShabadContent} />
    </div>
  );
}

export default ShabadPane;
