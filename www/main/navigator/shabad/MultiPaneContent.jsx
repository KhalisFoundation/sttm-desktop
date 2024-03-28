import React from 'react';
import PropTypes from 'prop-types';

const MultiPaneContent = ({ data }) => (
  <div className="shabad-list">
    <div className="verse-block">This is {data.multiPaneId}</div>
  </div>
);

MultiPaneContent.propTypes = {
  data: PropTypes.any,
};
export default MultiPaneContent;
