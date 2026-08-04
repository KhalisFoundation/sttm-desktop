import React from 'react';

import Pane from '../../../common/sttm-ui/pane/Pane';
import { DataLayer } from '../state-manager/DataLayer';
import reducer, { initialState } from '../state-manager/reducer';
import { MiscContent } from './MiscContent';
import { MiscFooter } from './MiscFooter';
import { MiscHeader } from './MiscHeader';

export const MiscPane = () => {
  const paneRef = React.createRef();

  return (
    <div className="pane-container misc-pane" ref={paneRef}>
      <DataLayer initialState={initialState} reducer={reducer}>
        {/*
          `Pane` renders each of these as a component type, so all three must be
          stable module-level components. Building one inline here would give it a
          new type on every render, and React would destroy and rebuild the whole
          footer, losing any click already in progress on the Quick Insert tray.
        */}
        <Pane header={MiscHeader} content={MiscContent} footer={MiscFooter} />
      </DataLayer>
    </div>
  );
};
