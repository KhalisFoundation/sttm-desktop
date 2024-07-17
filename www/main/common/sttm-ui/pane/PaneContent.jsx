import React from 'react';
import PropTypes from 'prop-types';

const PaneContent = ({ Content, data = {} }) => (
  <div className="pane-content">{Content ? <Content data={data} /> : ''}</div>
);

PaneContent.propTypes = {
  Content: PropTypes.any,
  data: PropTypes.any,
};

export default PaneContent;
