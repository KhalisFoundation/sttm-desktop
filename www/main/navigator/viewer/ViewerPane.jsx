import React from 'react';
import Pane from '../../common/sttm-ui/pane/Pane';
import ViewerContent from './ViewerContent';

function ViewerPane() {
  return (
    <div className="viewer-pane">
      <Pane header={null} content={ViewerContent} footer={null} />
    </div>
  );
}

export default ViewerPane;
