import React from 'react';
import PropTypes from 'prop-types';

import CeremonyPane from './CeremonyPane';
import useLoadCeremonies from '../hooks/use-load-ceremonies';
import { Overlay } from '../../../common/sttm-ui';
import { ceremoniesFilter } from '../../../common/constants';

const Ceremonies = ({ onScreenClose }) => {
  const { isLoadingCeremonies, ceremonies } = useLoadCeremonies();

  const visibleCeremonies =
    ceremonies.length > 0
      ? ceremoniesFilter.visible.map((cId) => {
          const ceremony = ceremonies.find((c) => c.id === cId);
          return ceremony;
        })
      : [];

  return (
    <Overlay onScreenClose={onScreenClose}>
      <div className="addon-wrapper ceremonies-wrapper">
        <header className="ceremonies-header ">Ceremonies</header>
        <div className="ceremonies-list ui-ceremonies">
          {isLoadingCeremonies && <div className="sttm-loader" />}
          {!isLoadingCeremonies &&
            visibleCeremonies.map((c) => (
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
