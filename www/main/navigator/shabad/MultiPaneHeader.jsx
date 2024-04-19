import React from 'react';
import PropTypes from 'prop-types';
import { useStoreActions, useStoreState } from 'easy-peasy';

const MultiPaneHeader = ({ data }) => {
  const paneId = data.multiPaneId;
  const navigatorState = useStoreState((state) => state.navigator);
  const navigatorActions = useStoreActions((state) => state.navigator);
  const paneAttributes = navigatorState[`pane${paneId}`];
  const setPaneAttributes = navigatorActions[`setPane${paneId}`];

  return (
    <div className={`shabad-pane-header pane-${paneId}`}>
      <span className="pane-symbol">{paneId}</span>
      <button
        onClick={() => {
          const updatedAttributes = { ...paneAttributes };
          updatedAttributes.locked = !paneAttributes.locked;
          if (paneAttributes !== updatedAttributes) {
            setPaneAttributes(updatedAttributes);
          }
        }}
      >
        {paneAttributes.locked ? (
          <i className="fa-solid fa-lock"></i>
        ) : (
          <i className="fa-solid fa-lock-open"></i>
        )}
      </button>
    </div>
  );
};

MultiPaneHeader.propTypes = {
  data: PropTypes.any,
};
export default MultiPaneHeader;
