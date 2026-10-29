import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

import Pane from '../../common/sttm-ui/pane/Pane';
import ShabadHeader from './ShabadHeader';
import MultiPaneHeader from './MultiPaneHeader';
import MultiPaneContent from './MultiPaneContent';

const ShabadPane = ({ className, multiPaneId = false }) => {
  const { activePaneId } = useStoreState((state) => state.navigator);
  const { defaultPaneId } = useStoreState((state) => state.userSettings);
  return (
    <div className={`pane-container shabad-pane ${className}`}>
      <Pane
        header={multiPaneId ? MultiPaneHeader : ShabadHeader}
        content={MultiPaneContent}
        data={{ multiPaneId: multiPaneId || defaultPaneId }}
        className={multiPaneId === activePaneId ? 'live-pane' : 'inactive-pane'}
      />
    </div>
  );
};

ShabadPane.propTypes = {
  className: PropTypes.string,
  multiPaneId: PropTypes.number,
};
export default ShabadPane;
