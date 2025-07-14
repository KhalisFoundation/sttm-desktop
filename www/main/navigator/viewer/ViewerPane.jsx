import React from 'react';
import Pane from '../../common/sttm-ui/pane/Pane';
import ViewerContent from './ViewerContent';

const ViewerPane = React.memo(() => (
  <div className="pane-container viewer-pane">
    <Pane header={null} content={ViewerContent} footer={null} />
  </div>
));

ViewerPane.displayName = 'ViewerPane';

export default ViewerPane;
