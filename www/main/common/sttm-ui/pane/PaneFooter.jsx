import React from 'react';
import PropTypes from 'prop-types';

function PaneFooter({ Footer }) {
  return <div className="pane-footer">{Footer ? <Footer /> : ''}</div>;
}

PaneFooter.propTypes = {
  Footer: PropTypes.any,
};

export default PaneFooter;
