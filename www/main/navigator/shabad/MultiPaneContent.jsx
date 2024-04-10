import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import { useStoreActions, useStoreState } from 'easy-peasy';
import { ShabadText } from './ShabadText';

const MultiPaneContent = ({ data }) => {
  const paneId = data.multiPaneId;
  const navigatorState = useStoreState((state) => state.navigator);
  const navigatorActions = useStoreActions((state) => state.navigator);
  const paneAttributes = navigatorState[`pane${paneId}`];
  const setPaneAttributes = navigatorActions[`setPane${paneId}`];
  const { activePaneId } = navigatorState;

  useEffect(() => {
    if (activePaneId === paneId) {
      setPaneAttributes({ ...paneAttributes, locked: true });
    } else {
      setPaneAttributes({ ...paneAttributes, locked: false });
    }
  }, [activePaneId]);

  return (
    <ShabadText
      shabadId={paneAttributes.activeShabad}
      baniType="shabad"
      baniLength="short"
      paneId={paneId}
    />
  );
};

MultiPaneContent.propTypes = {
  data: PropTypes.any,
};
export default MultiPaneContent;
