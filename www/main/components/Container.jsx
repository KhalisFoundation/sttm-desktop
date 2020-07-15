import React, { useState } from 'react';
import PropTypes from 'prop-types';

import GlobalState from './contexts/GlobalState';

function Container(props) {
  const [state, setState] = useState({ currentOverlayScreen: null });
  return (
    <GlobalState.Provider value={[state, setState]}>
      <div className="navigator-container"> {props.children} </div>
    </GlobalState.Provider>
  );
}

Container.propTypes = {
  children: PropTypes.node.isRequired,
};

export default Container;
