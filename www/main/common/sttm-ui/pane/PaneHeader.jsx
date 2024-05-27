import React from 'react';
import PropTypes from 'prop-types';

const PaneHeader = ({ Header, data = {} }) => (
  <div className="pane-header">{Header ? <Header data={data} /> : ''}</div>
);

PaneHeader.propTypes = {
  Header: PropTypes.any,
  data: PropTypes.any,
};

export default PaneHeader;
