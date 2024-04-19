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
  const { activePaneId, homeVerse, versesRead } = navigatorState;
  const { setHomeVerse, setVersesRead } = navigatorActions;

  useEffect(() => {
    if (activePaneId === paneId) {
      setPaneAttributes({ ...paneAttributes, locked: true });
      if (homeVerse !== paneAttributes.homeVerse) setHomeVerse(paneAttributes.homeVerse);
      if (versesRead !== paneAttributes.versesRead) setVersesRead(paneAttributes.versesRead);
    } else {
      setPaneAttributes({ ...paneAttributes, locked: false });
    }
  }, [activePaneId]);

  return (
    <ShabadText
      shabadId={paneAttributes.activeShabad}
      baniType="shabad"
      baniLength="short"
      paneAttributes={paneAttributes}
      setPaneAttributes={setPaneAttributes}
      currentPane={paneId}
    />
  );
};

MultiPaneContent.propTypes = {
  data: PropTypes.any,
};
export default MultiPaneContent;
