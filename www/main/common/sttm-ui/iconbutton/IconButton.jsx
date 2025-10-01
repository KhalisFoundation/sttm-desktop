import React from 'react';
import PropTypes from 'prop-types';

const IconButton = ({ icon, onClick, className, title }) => (
  <button className={`icon-button ${className}`} onClick={onClick} title={title}>
    <i className={icon} />
  </button>
);

IconButton.propTypes = {
  icon: PropTypes.string,
  onClick: PropTypes.func,
  className: PropTypes.string,
  title: PropTypes.string,
};

export default IconButton;
