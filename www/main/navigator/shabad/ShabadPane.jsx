import React from 'react';
import PropTypes from 'prop-types';
import Pane from '../../common/sttm-ui/pane/Pane';
import ShabadContent from './ShabadContent';
import ShabadHeader from './ShabadHeader';
import MultiPaneHeader from './MultiPaneHeader';
import MultiPaneContent from './MultiPaneContent';

const ShabadPane = ({ className, multiPaneId = false }) => (
  <div className={`pane-container shabad-pane ${className}`}>
    <Pane
      header={multiPaneId ? MultiPaneHeader : ShabadHeader}
      content={multiPaneId ? MultiPaneContent : ShabadContent}
      data={{ multiPaneId }}
    />
  </div>
);

ShabadPane.propTypes = {
  className: PropTypes.string,
  multiPaneId: PropTypes.number,
};
export default ShabadPane;
