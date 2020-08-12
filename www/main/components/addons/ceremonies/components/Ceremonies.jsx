import React from 'react';
import PropTypes from 'prop-types';

import CeremonyPane from './CeremonyPane';
import useLoadCeremonies from '../hooks/use-load-ceremonies';
import { Overlay } from '../../../../sttm-ui';
import { visibleCeremoniesTokens } from '../../../../constants';

const Ceremonies = ({ onScreenClose }) => {
  const { isLoadingCeremonies, ceremonies } = useLoadCeremonies();

  console.log(ceremonies, 'ceremonies');
  const visibleCeremonies =
    ceremonies.length > 0
      ? visibleCeremoniesTokens.map(token => {
          const ceremony = ceremonies.find(c => c.token === token);
          return ceremony;
        })
      : [];
  console.log(visibleCeremonies, isLoadingCeremonies, '....');

  return (
    <Overlay onClose={onScreenClose}>
      <div className="ceremonies-wrapper">
        <div className="ceremonies-list ui-ceremonies">
          <header className="navigator-header ceremonies-header">ceremonies</header>
          {isLoadingCeremonies && <div className="sttm-loader" />}
          {!isLoadingCeremonies &&
            visibleCeremonies.map(c => <CeremonyPane key={c.token} {...c} />)}
        </div>
      </div>
    </Overlay>
  );
};

Ceremonies.propTypes = {
  onScreenClose: PropTypes.func,
};

export default Ceremonies;
