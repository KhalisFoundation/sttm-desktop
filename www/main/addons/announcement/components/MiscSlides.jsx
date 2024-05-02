import React, { useRef, useState } from 'react';
import { useStoreState } from 'easy-peasy';

import { useSlides } from '../../../common/hooks';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const MiscSlides = () => {
  const { openWaheguruSlide, openMoolMantraSlide, openBlankViewer, openAnandSahibBhog } =
    useSlides();

  const { currentWorkspace } = useStoreState((state) => state.userSettings);

  const [paneSelectorActive, setPaneSelectorActive] = useState(false);
  const paneSelector = useRef(null);

  return (
    <>
      <header className="sync-header">
        <h3>{i18n.t('INSERT.ADD_SLIDES')}</h3>
      </header>

      <div className="misc-slides-pane">
        <div
          className={`history-results multipane-dropdown ${
            paneSelectorActive ? 'enabled' : 'disabled'
          }`}
          ref={paneSelector}
          onMouseLeave={() => setPaneSelectorActive(false)}
        >
          <p
            onClick={() => {
              openAnandSahibBhog({ openedFrom: 'shortcut-tray', paneId: 1 });
              setPaneSelectorActive(false);
            }}
            className="history-item"
          >
            Open in Pane 1
          </p>
          <p
            onClick={() => {
              openAnandSahibBhog({ openedFrom: 'shortcut-tray', paneId: 2 });
              setPaneSelectorActive(false);
            }}
            className="history-item"
          >
            Open in Pane 2
          </p>
          <p
            onClick={() => {
              openAnandSahibBhog({ openedFrom: 'shortcut-tray', paneId: 3 });
              setPaneSelectorActive(false);
            }}
            className="history-item"
          >
            Open in Pane 3
          </p>
        </div>
        <button
          className="misc-slide-button"
          onClick={(e) => {
            if (currentWorkspace === i18n.t('WORKSPACES.MULTI_PANE')) {
              paneSelector.current.style.left = `${e.clientX - 100}px`;
              if (window.innerHeight - e.clientY > 200) {
                paneSelector.current.style.top = `${e.clientY - 30}px`;
              } else {
                paneSelector.current.style.top = `${e.clientY - 195}px`;
              }
              setPaneSelectorActive(true);
            } else {
              openAnandSahibBhog({ openedFrom: 'shortcut-tray' });
            }
          }}
        >
          {i18n.t(`SHORTCUT_TRAY.ANAND_SAHIB`)}
        </button>
        <button
          className="misc-slide-button"
          onClick={() => {
            setPaneSelectorActive(false);
            openMoolMantraSlide({ openedFrom: 'shortcut-tray' });
          }}
        >
          {i18n.t(`SHORTCUT_TRAY.MOOL_MANTRA`)}
        </button>
        <button
          className="gurmukhi misc-slide-button"
          onClick={() => {
            setPaneSelectorActive(false);
            openWaheguruSlide({ openedFrom: 'shortcut-tray' });
          }}
        >
          vwihgurU
        </button>
        <button
          className="misc-slide-button"
          onClick={() => {
            setPaneSelectorActive(false);
            openBlankViewer({ openedFrom: 'shortcut-tray' });
          }}
        >
          {i18n.t(`SHORTCUT_TRAY.BLANK`)}
        </button>
      </div>
    </>
  );
};

export default MiscSlides;
