import React from 'react';
import PropTypes from 'prop-types';

import CeremonyPane from './CeremonyPane';
import useLoadCeremonies from '../hooks/use-load-ceremonies';
import { Overlay } from '../../../../sttm-ui';

const Ceremonies = ({ onScreenClose }) => {
  const { isLoadingCeremonies, ceremonies } = useLoadCeremonies();
  console.log(isLoadingCeremonies, ceremonies, '>>>>>>>>>>.');
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
