import React from 'react';
import PropTypes from 'prop-types';

import Pane from '../../../common/sttm-ui/pane/Pane';
import { DataLayer } from '../state-manager/DataLayer';
import reducer, { initialState } from '../state-manager/reducer';
import { MiscContent } from './MiscContent';
import { MiscFooter } from './MiscFooter';
import { MiscHeader } from './MiscHeader';

export const MiscPane = ({ waheguruSlide, moolMantraSlide, blankSlide, anandSahibBhog }) => {
  const paneRef = React.createRef();

  const footerComponent = () => (
    <MiscFooter
      waheguruSlide={waheguruSlide}
      moolMantraSlide={moolMantraSlide}
      blankSlide={blankSlide}
      anandSahibBhog={anandSahibBhog}
    />
  );

  return (
    <div className="pane-container misc-pane" ref={paneRef}>
      <DataLayer initialState={initialState} reducer={reducer}>
        <Pane header={MiscHeader} content={MiscContent} footer={footerComponent} />
      </DataLayer>
    </div>
  );
};

MiscPane.propTypes = {
  waheguruSlide: PropTypes.func,
  moolMantraSlide: PropTypes.func,
  blankSlide: PropTypes.func,
  anandSahibBhog: PropTypes.func,
};
