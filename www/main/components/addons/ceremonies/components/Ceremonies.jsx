import React from 'react';
import PropTypes from 'prop-types';

import CeremonyPane from './CeremonyPane';
import { Overlay } from '../../../../sttm-ui';

const Ceremonies = ({ onScreenClose }) => {
  return (
    <Overlay onClose={onScreenClose}>
      <div className="ceremonies-wrapper">
        <div className="ceremonies-list ui-ceremonies">
          <header className="navigator-header ceremonies-header">ceremonies</header>
          <CeremonyPane name="anandkaraj" paneId="anandkaraj" />
        </div>
      </div>
    </Overlay>
  );
};

Ceremonies.propTypes = {
  onScreenClose: PropTypes.func,
};

export default Ceremonies;
