import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useStoreState, useStoreActions } from 'easy-peasy';

import classNames from '../../common/utils/classnames';
import FavShabadIcon from './FavShabadIcon';
import ArrowIcon from './ArrowIcon';
import { i18n } from '../../common/i18n';

const electron = require('electron');

const { ipcRenderer } = electron;

const ShabadHeader = ({ data = {} }) => {
  const [showViewer, setShowViewer] = useState(true);
  const [canSwapDisplays, setCanSwapDisplays] = useState(false);
  const { defaultPaneId } = useStoreState((state) => state.userSettings);
  const { activePaneId, pane1, pane2, pane3, isSundarGutkaBani, isCeremonyBani } = useStoreState(
    (state) => state.navigator,
  );
  const {
    setPane1,
    setPane2,
    setPane3,
    setActiveShabadId,
    setActiveVerseId,
    setSundarGutkaBaniId,
    setCeremonyId,
    setIsSundarGutkaBani,
    setIsCeremonyBani,
    setVersesRead,
    setHomeVerse,
    setPaneCleared,
  } = useStoreActions((actions) => actions.navigator);

  const livePaneId = activePaneId || defaultPaneId || 1;
  // This header only renders in the bottom-left pane. Clear that pane, not
  // whichever pane happens to be live.
  const bottomLeftPane = { 1: pane1, 2: pane2, 3: pane3 }[defaultPaneId] || pane1;
  const hasLines = Boolean(bottomLeftPane && bottomLeftPane.activeShabad);

  const clearLivePane = () => {
    const paneId = defaultPaneId || 1;
    const cleared = {
      locked: bottomLeftPane ? bottomLeftPane.locked : false,
      activeShabad: null,
      activeVerse: '',
      versesRead: [],
      homeVerse: false,
      content: '',
      baniType: null,
    };
    const setters = { 1: setPane1, 2: setPane2, 3: setPane3 };
    if (setters[paneId]) setters[paneId](cleared);
    // Display 2 only follows the live pane. Clearing a non-live pane must not
    // blank the projection.
    if (paneId !== livePaneId) return;
    // Scalars are what Display 2's list follows. Clearing only the pane object
    // leaves the projected shabad up.
    setActiveShabadId(null);
    setActiveVerseId(null);
    setSundarGutkaBaniId(null);
    setCeremonyId(null);
    if (isSundarGutkaBani) setIsSundarGutkaBani(false);
    if (isCeremonyBani) setIsCeremonyBani(false);
    setVersesRead([]);
    setHomeVerse(false);
    // Launchpad only pushes a pane that still has a shabad. This flag is the
    // signal to push the empty pane so Display 2 clears too.
    setPaneCleared(Date.now());
  };

  useEffect(() => {
    if (!data.isProjection) ipcRenderer.send('toggle-viewer-window', showViewer);
  }, [data.isProjection, showViewer]);

  useEffect(() => {
    if (data.isProjection) return undefined;

    const onDualDisplayState = (_event, state) => {
      setCanSwapDisplays(Boolean(state && state.canSwap));
    };

    ipcRenderer.on('dual-display-state', onDualDisplayState);
    ipcRenderer.send('dual-display-state-request');

    return () => {
      ipcRenderer.removeListener('dual-display-state', onDualDisplayState);
    };
  }, [data.isProjection]);

  return (
    <div className="shabad-pane-header">
      <FavShabadIcon />
      <button
        className={classNames('button toggle-viewer-btn', !showViewer && 'btn-danger')}
        onClick={() => setShowViewer(!showViewer)}
        title={showViewer ? i18n.t('SHABAD_PANE.HIDE_BUTTON_TOOLTIP') : ''}
      >
        {showViewer ? (
          <>
            <img src="assets/img/icons/monitor-slash.png" />
            <p>{i18n.t('SHABAD_PANE.HIDE_SCREEN')}</p>
          </>
        ) : (
          <>
            <img src="assets/img/icons/monitor.png" />
            <p>{i18n.t('SHABAD_PANE.SHOW_DISPLAY')}</p>
          </>
        )}
      </button>
      {canSwapDisplays && !data.isProjection && (
        <button
          className="button toggle-viewer-btn swap-displays-btn"
          onClick={() => ipcRenderer.send('swap-display-roles')}
          title={i18n.t('SHABAD_PANE.SWAP_DISPLAYS_TOOLTIP')}
        >
          <img src="assets/img/icons/monitor.png" />
          <p>{i18n.t('SHABAD_PANE.SWAP_DISPLAYS')}</p>
        </button>
      )}
      <ArrowIcon paneId={defaultPaneId} />
      {hasLines && canSwapDisplays && !data.isProjection && (
        <button
          className="clear-pane-btn"
          onClick={clearLivePane}
          title={i18n.t('SHABAD_PANE.CLEAR_TELEPROMPTER_TOOLTIP')}
        >
          {i18n.t('SHABAD_PANE.CLEAR_TELEPROMPTER')}
        </button>
      )}
    </div>
  );
};

ShabadHeader.propTypes = {
  data: PropTypes.object,
};

export default ShabadHeader;
