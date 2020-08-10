import React from 'react';

import { Switch, Tile } from '../../../../sttm-ui';

const CeremonyPane = ({ name, paneId }) => {
  return (
    <div className="ceremony-pane" id={paneId}>
      <header className="toolbar-nh navigator-header">
        <span className="gurmukhi">{name}</span>
      </header>
      <div className="ceremony-pane-content">
        <div className="ceremony-pane-options" id={`cpo-${paneId}`}>
          <Switch
            title={i18n.t('TOOLBAR.ENG_EXPLANATIONS')}
            controlId="anandkaraj-english-exp-toggle"
            className="anandkaraj-english-exp-switch"
          />

          <div className="ceremony-pane-themes">
            <div className="ceremony-theme-header"> {i18n.t('TOOLBAR.CHOOSE_THEME')} </div>

            <Tile className="theme-instance" theme="LOW_LIGHT">
              Light
            </Tile>

            <Tile classNames="theme-instance" theme="FLORAL">
              Floral
            </Tile>

            <Tile className="theme-instance" theme="FLORAL">
              Floral
            </Tile>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CeremonyPane;
