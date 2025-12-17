import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import { useStoreActions, useStoreState } from 'easy-peasy';

import { ShabadText } from './ShabadText';
import { FavoritePane, HistoryPane } from '../misc/components';
import { useSlides } from '../../common/hooks';

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
  const { currentWorkspace } = useStoreState((state) => state.userSettings);

  const {
    displayWaheguruSlide,
    displayMoolMantraSlide,
    displayBlankViewer,
    displayAnandSahibBhog,
  } = useSlides();

  useEffect(() => {
    if (activePaneId === paneId) {
      if (homeVerse !== paneAttributes.homeVerse) setHomeVerse(paneAttributes.homeVerse);
      if (versesRead !== paneAttributes.versesRead) setVersesRead(paneAttributes.versesRead);
    }
  }, [activePaneId]);

  useEffect(() => {
    setPaneAttributes({ ...paneAttributes, content: i18n.t('MULTI_PANE.SHABAD') });
  }, [currentWorkspace]);

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
          baniType={paneAttributes.baniType}
          paneAttributes={paneAttributes}
          setPaneAttributes={setPaneAttributes}
          currentPane={paneId}
        />
      );
    case i18n.t('TOOLBAR.HISTORY'):
      return (
        <>
          {goToShabadBtn}
          <HistoryPane paneId={paneId} />
        </>
      );
    case i18n.t('MULTI_PANE.MISC_SLIDES'):
      return (
        <>
          {goToShabadBtn}
          <ul className="history-results">
            <li
              className="history-item-container"
              onClick={() => displayAnandSahibBhog({ openedFrom: 'multipane-content', paneId })}
            >
              <p className="history-item">{i18n.t(`SHORTCUT_TRAY.ANAND_SAHIB`)}</p>
            </li>
            <li
              className="history-item-container"
              onClick={() => displayMoolMantraSlide({ openedFrom: 'multipane-content' })}
            >
              <p className="history-item">{i18n.t(`SHORTCUT_TRAY.MOOL_MANTRA`)}</p>
            </li>
            <li
              className="gurmukhi history-item-container"
              onClick={() => displayWaheguruSlide({ openedFrom: 'multipane-content' })}
            >
              <p className="history-item">vwihgurU</p>
            </li>
            <li
              className="history-item-container"
              onClick={() => displayBlankViewer({ openedFrom: 'multiplane-content' })}
            >
              <p className="history-item">{i18n.t(`SHORTCUT_TRAY.BLANK`)}</p>
            </li>
          </ul>
        </>
      );
    case i18n.t('MULTI_PANE.FAVORITES'):
      return (
        <>
          {goToShabadBtn}
          <FavoritePane paneId={paneId} />
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
