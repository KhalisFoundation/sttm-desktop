import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

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
    </div>
  );
};

ShabadHeader.propTypes = {
  data: PropTypes.object,
};

export default ShabadHeader;
