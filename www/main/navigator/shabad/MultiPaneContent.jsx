import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import { useStoreActions, useStoreState } from 'easy-peasy';

import { ShabadText } from './ShabadText';
import { HistoryPane } from '../misc/components';
import Slides from '../../addons/announcement/components/Slides';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

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

  const goToShabadBtn = (
    <button
      className="multipane-content-btn"
      style={paneAttributes.activeShabad ? {} : { display: 'none' }}
      onClick={() => {
        setPaneAttributes({ ...paneAttributes, content: i18n.t('MULTI_PANE.SHABAD') });
      }}
      onMouseEnter={(e) => {
        e.currentTarget.children[0].classList.add('fa-beat');
      }}
      onMouseLeave={(e) => {
        e.currentTarget.children[0].classList.remove('fa-beat');
      }}
    >
      <i className="fa-solid fa-arrow-left"></i>
      <span>{i18n.t('MULTI_PANE.SHABAD_BTN')}</span>
    </button>
  );

  switch (paneAttributes.content) {
    case i18n.t('MULTI_PANE.CLEAR_PANE'):
      return null;
    case i18n.t('MULTI_PANE.SHABAD'):
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
    case i18n.t('TOOLBAR.HISTORY'):
      return (
        <>
          {goToShabadBtn}
          <HistoryPane />
        </>
      );
    case i18n.t('MULTI_PANE.MISC_SLIDES'):
      return (
        <>
          {goToShabadBtn}
          <Slides />
        </>
      );
    default:
      return null;
  }
};

MultiPaneContent.propTypes = {
  data: PropTypes.any,
};
export default MultiPaneContent;
