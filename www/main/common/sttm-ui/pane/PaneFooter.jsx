import React from 'react';
import PropTypes from 'prop-types';

const PaneFooter = ({ Footer }) => {
  return <div className="pane-footer">{Footer ? <Footer /> : ''}</div>;
};

PaneFooter.propTypes = {
  Footer: PropTypes.any,
};

export default PaneFooter;
