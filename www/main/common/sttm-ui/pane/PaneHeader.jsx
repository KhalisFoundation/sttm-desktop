import React from 'react';
import PropTypes from 'prop-types';

function PaneHeader({ Header }) {
  return <div className="pane-header">{Header ? <Header /> : ''}</div>;
}

PaneHeader.propTypes = {
  Header: PropTypes.any,
};

export default PaneHeader;
