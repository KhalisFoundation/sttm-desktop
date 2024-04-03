import React from 'react';
import { useSlides } from '../../../common/hooks';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const Slides = () => {
  const { openWaheguruSlide, openMoolMantraSlide, openBlankViewer, openAnandSahibBhog } = useSlides();

  return (
    <>
      <header className="sync-header">
        <h3>{i18n.t('INSERT.ADD_SLIDES')}</h3>
      </header>
      <div className="slides-pane-container">
        <div className="slides-pane">
          <button
            className="tray-item-icon"
            onClick={() => openAnandSahibBhog({ openedFrom: 'shortcut-tray' })}
          >
            {i18n.t(`SHORTCUT_TRAY.ANAND_SAHIB`)}
          </button>
          <button
            className="tray-item-icon"
            onClick={() => openMoolMantraSlide({ openedFrom: 'shortcut-tray' })}
          >
            {i18n.t(`SHORTCUT_TRAY.MOOL_MANTRA`)}
          </button>
          <button
            className="gurmukhi tray-item-icon"
            onClick={() => openWaheguruSlide({ openedFrom: 'shortcut-tray' })}
          >
            vwihgurU
          </button>
          <button
            className="tray-item-icon"
            onClick={() => openBlankViewer({ openedFrom: 'shortcut-tray' })}
          >
            {i18n.t(`SHORTCUT_TRAY.BLANK`)}
          </button>
        </div>
      </div>
    </>
  )
};

export default Slides;
