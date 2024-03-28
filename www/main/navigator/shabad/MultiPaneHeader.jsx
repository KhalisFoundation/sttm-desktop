import React from 'react';
import PropTypes from 'prop-types';

const MultiPaneHeader = ({ data }) => {
  console.log('MultiPaneHeader', data);
  const heading = `Shabad Header ${data.multiPaneId}`;
  return <div className="shabad-pane-header">{heading}</div>;
};

MultiPaneHeader.propTypes = {
  data: PropTypes.any,
};
export default MultiPaneHeader;
