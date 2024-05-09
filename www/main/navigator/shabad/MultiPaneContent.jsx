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

  const { openWaheguruSlide, openMoolMantraSlide, openBlankViewer, openAnandSahibBhog } =
    useSlides();

  useEffect(() => {
    if (activePaneId === paneId) {
      if (homeVerse !== paneAttributes.homeVerse) setHomeVerse(paneAttributes.homeVerse);
      if (versesRead !== paneAttributes.versesRead) setVersesRead(paneAttributes.versesRead);
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
              className="history-item"
              onClick={() => openAnandSahibBhog({ openedFrom: 'multipane-content', paneId })}
            >
              {i18n.t(`SHORTCUT_TRAY.ANAND_SAHIB`)}
            </li>
            <li
              className="history-item"
              onClick={() => openMoolMantraSlide({ openedFrom: 'multipane-content' })}
            >
              {i18n.t(`SHORTCUT_TRAY.MOOL_MANTRA`)}
            </li>
            <li
              className="gurmukhi history-item"
              onClick={() => openWaheguruSlide({ openedFrom: 'multipane-content' })}
            >
              vwihgurU
            </li>
            <li
              className="history-item"
              onClick={() => openBlankViewer({ openedFrom: 'multiplane-content' })}
            >
              {i18n.t(`SHORTCUT_TRAY.BLANK`)}
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
