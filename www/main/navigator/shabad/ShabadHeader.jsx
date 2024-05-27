import React, { useEffect, useState } from 'react';

import classNames from '../../common/utils/classnames';
import FavShabadIcon from './FavShabadIcon';
import ArrowIcon from './ArrowIcon';

const electron = require('electron');

const { ipcRenderer } = electron;
const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const ShabadHeader = () => {
  const [showViewer, setShowViewer] = useState(true);

  useEffect(() => {
    ipcRenderer.send('toggle-viewer-window', showViewer);
  }, [showViewer]);

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
      <ArrowIcon />
    </div>
  );
};

export default ShabadHeader;
