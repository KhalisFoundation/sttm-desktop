import React from 'react';
import PropTypes from 'prop-types';

const PaneContent = ({ Content }) => {
  return <div className="pane-content">{Content ? <Content /> : ''}</div>;
};

PaneContent.propTypes = {
  Content: PropTypes.any,
};

export default PaneContent;
