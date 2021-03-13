import React from 'react';
import Pane from '../../../common/sttm-ui/pane/Pane';
import { DataLayer } from '../state-manager/DataLayer';
import reducer, { initialState } from '../state-manager/reducer';
import MiscContent from './MiscContent';
import MiscHeader from './MiscHeader';

function MiscPane() {
  return (
    <div className="misc-pane">
      <DataLayer initialState={initialState} reducer={reducer}>
        <Pane header={MiscHeader} content={MiscContent} />
      </DataLayer>
    </div>
  );
}

export default MiscPane;
