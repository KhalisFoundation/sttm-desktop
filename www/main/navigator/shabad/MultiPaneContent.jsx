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
  const isProjection = data.isProjection || false;
  const projectionSource = data.projectionSource || false;
  const navigatorState = useStoreState((state) => state.navigator);
  const navigatorActions = useStoreActions((state) => state.navigator);
  const paneAttributes = navigatorState[`pane${paneId}`];
  const setPaneAttributes = navigatorActions[`setPane${paneId}`];
  const {
    activePaneId,
    homeVerse,
    versesRead,
    activeShabadId,
    isSundarGutkaBani,
    isCeremonyBani,
    sundarGutkaBaniId,
    ceremonyId,
  } = navigatorState;
  const { setHomeVerse, setVersesRead } = navigatorActions;
  const { currentWorkspace } = useStoreState((state) => state.userSettings);

  const {
    displayWaheguruSlide,
    displayMoolMantraSlide,
    displayBlankViewer,
    displayAnandSahibBhog,
  } = useSlides();

  useEffect(() => {
    if (!isProjection && activePaneId === paneId && paneAttributes) {
      if (homeVerse !== paneAttributes.homeVerse) setHomeVerse(paneAttributes.homeVerse);
      const read = paneAttributes.versesRead;
      if (versesRead !== read) setVersesRead(Array.isArray(read) ? [...read] : []);
    }
    // Only when the live pane changes. Re-running on versesRead would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePaneId]);

  useEffect(() => {
    if (!isProjection && paneAttributes) {
      setPaneAttributes({
        content: i18n.t('MULTI_PANE.SHABAD'),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace]);

  const goToShabadBtn = (
    <button
      className="multipane-content-btn"
      style={paneAttributes.activeShabad ? {} : { display: 'none' }}
      onClick={() => {
        setPaneAttributes({ content: i18n.t('MULTI_PANE.SHABAD') });
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
    case i18n.t('MULTI_PANE.SHABAD'): {
      // Display 2's pane copy is only filled by the startup snapshot, so a later
      // shabad change never reaches pane.activeShabad — only the live scalar ids
      // (which already move the projected line) stay in step. Follow those on the
      // projection so the list tracks shabad changes, not just line changes.
      let projectedShabadId = paneAttributes.activeShabad;
      let projectedBaniType = paneAttributes.baniType;
      if (isProjection) {
        if (isSundarGutkaBani && sundarGutkaBaniId) {
          projectedShabadId = sundarGutkaBaniId;
          projectedBaniType = 'bani';
        } else if (isCeremonyBani && ceremonyId) {
          projectedShabadId = ceremonyId;
          projectedBaniType = 'ceremony';
        } else if (activeShabadId) {
          projectedShabadId = activeShabadId;
          projectedBaniType = 'shabad';
        }
      }
      return (
        <ShabadText
          shabadId={projectedShabadId}
          baniType={projectedBaniType}
          paneAttributes={paneAttributes}
          setPaneAttributes={setPaneAttributes}
          currentPane={paneId}
          isProjection={isProjection}
          projectionSource={projectionSource}
        />
      );
    }
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
