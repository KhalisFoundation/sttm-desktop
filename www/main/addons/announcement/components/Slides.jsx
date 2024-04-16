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

      <div className="misc-slides-pane">
        <button
          className="misc-slide-button"
          onClick={() => openAnandSahibBhog({ openedFrom: 'shortcut-tray' })}
        >
          {i18n.t(`SHORTCUT_TRAY.ANAND_SAHIB`)}
        </button>
        <button
          className="misc-slide-button"
          onClick={() => openMoolMantraSlide({ openedFrom: 'shortcut-tray' })}
        >
          {i18n.t(`SHORTCUT_TRAY.MOOL_MANTRA`)}
        </button>
        <button
          className="gurmukhi misc-slide-button"
          onClick={() => openWaheguruSlide({ openedFrom: 'shortcut-tray' })}
        >
          vwihgurU
        </button>
        <button
          className="misc-slide-button"
          onClick={() => openBlankViewer({ openedFrom: 'shortcut-tray' })}
        >
          {i18n.t(`SHORTCUT_TRAY.BLANK`)}
        </button>
      </div>
    </>
  )
};

export default Slides;
