import React from 'react';
import Pane from '../../../common/sttm-ui/pane/Pane';
import { DataLayer } from '../state-manager/DataLayer';
import reducer, { initialState } from '../state-manager/reducer';
import { MiscContent } from './MiscContent';
import { MiscFooter } from './MiscFooter';
import { MiscHeader } from './MiscHeader';

export const MiscPane = () => {
  return (
    <div className="misc-pane">
      <DataLayer initialState={initialState} reducer={reducer}>
        <Pane header={MiscHeader} content={MiscContent} footer={MiscFooter} />
      </DataLayer>
    </div>
  );
};
