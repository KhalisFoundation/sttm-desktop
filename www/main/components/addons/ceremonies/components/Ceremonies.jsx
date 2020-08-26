import React from 'react';
import PropTypes from 'prop-types';

import CeremonyPane from './CeremonyPane';
import useLoadCeremonies from '../hooks/use-load-ceremonies';
import { Overlay } from '../../../../sttm-ui';
import { visibleCeremoniesIds } from '../../../../constants';

const Ceremonies = ({ onScreenClose }) => {
  const { isLoadingCeremonies, ceremonies } = useLoadCeremonies();

  const visibleCeremonies =
    ceremonies.length > 0
      ? visibleCeremoniesIds.map(cId => {
          const ceremony = ceremonies.find(c => c.id === cId);
          return ceremony;
        })
      : [];

  return (
    <Overlay onScreenClose={onScreenClose}>
      <div className="ceremonies-wrapper">
        <div className="ceremonies-list ui-ceremonies">
          <header className="navigator-header ceremonies-header">ceremonies</header>
          {isLoadingCeremonies && <div className="sttm-loader" />}
          {!isLoadingCeremonies &&
            visibleCeremonies.map(c => (
              <CeremonyPane key={c.token} {...c} onScreenClose={onScreenClose} />
            ))}
        </div>
      </div>
    </Overlay>
  );
};

Ceremonies.propTypes = {
  onScreenClose: PropTypes.func,
};

export default Ceremonies;